import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (!propertyId) throw new Error("Missing propertyId");
    if (!address) throw new Error("Missing address");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const geoKey = Deno.env.get("GOOGLE_MAPS_KEY");
    if (!geoKey) throw new Error("GOOGLE_MAPS_KEY is not configured");

    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${
        encodeURIComponent(address)
      }&key=${encodeURIComponent(geoKey)}&region=nz`,
    );
    const geo = (await geoRes.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };

    if (geo.status !== "OK") {
      throw new Error(`Geocode failed: ${geo.status ?? "unknown"}`);
    }

    const loc = geo.results?.[0]?.geometry?.location;
    const normalized = geo.results?.[0]?.formatted_address ?? null;
    const lat = loc?.lat;
    const lng = loc?.lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Geocode returned invalid coordinates");
    }

    const linzKey = Deno.env.get("LINZ_API_KEY") ?? "";
    let parcel: Record<string, unknown> | null = null;
    let title: Record<string, unknown> | null = null;

    if (linzKey.length > 0) {
      const cql = `DWITHIN(shape,POINT(${lng} ${lat}),200,meters)`;
      const cqlEnc = encodeURIComponent(cql);

      const fetchLayerProps = async (typeNames: string): Promise<Record<string, unknown> | null> => {
        const url =
          `https://data.linz.govt.nz/services/wfs?key=${encodeURIComponent(linzKey)}&service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeNames}&outputFormat=json&cql_filter=${cqlEnc}&count=1`;
        const res = await fetch(url);
        const text = await res.text();
        try {
          const json = JSON.parse(text) as { features?: Array<{ properties?: unknown }> };
          const props = json.features?.[0]?.properties;
          return props && typeof props === "object" ? (props as Record<string, unknown>) : null;
        } catch {
          console.log("LINZ error:", typeNames, text.substring(0, 200));
          return null;
        }
      };

      parcel = await fetchLayerProps("layer-50804");
      title = await fetchLayerProps("layer-50867");
    }

    const titleNo = title?.title_no;
    const appellation = parcel?.appellation;
    const legalDesc = parcel?.legal_desc;
    const estateFromTitle =
      title?.estate_description ?? title?.type ?? parcel?.estate_description;
    const areaRaw = parcel?.area;
    const parcelId = parcel?.id;

    const updateData = {
      address_normalized: normalized,
      latitude: lat,
      longitude: lng,
      title_number: titleNo != null ? String(titleNo) : null,
      legal_description:
        appellation != null
          ? String(appellation)
          : legalDesc != null
          ? String(legalDesc)
          : null,
      estate_type:
        estateFromTitle != null && String(estateFromTitle).trim() !== ""
          ? String(estateFromTitle)
          : "Fee Simple",
      land_area_m2: (() => {
        if (areaRaw == null || areaRaw === "") return null;
        const n = Number(areaRaw);
        return Number.isFinite(n) ? Math.round(n) : null;
      })(),
      linz_parcel_id: parcelId != null ? String(parcelId) : null,
      data_sources: {
        linz: Boolean(parcel || title),
        linz_parcel: Boolean(parcel),
        linz_title: Boolean(title),
        geocode: "google",
        enriched_at: new Date().toISOString(),
      },
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("application_properties").update(updateData).eq("id", propertyId);
    if (error) throw error;

    return new Response(
        JSON.stringify({
          success: true,
          data: updateData,
          parcel_found: Boolean(parcel),
          title_found: Boolean(title),
        }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
