import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function linzFetch(key: string, layerId: string, cql: string): Promise<{ status: number; body: string }> {
  const host = "data.linz.govt.nz";
  const path = `/services;key=${key}/wfs?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=${layerId}&outputFormat=json&CQL_FILTER=${encodeURIComponent(cql)}&maxFeatures=1`;
  const reqStr = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nAccept: application/json, */*\r\nConnection: close\r\n\r\n`;
  const conn = await Deno.connectTls({ hostname: host, port: 443 });
  try {
    await conn.write(new TextEncoder().encode(reqStr));
    const chunks: Uint8Array[] = [];
    const buf = new Uint8Array(32768);
    while (true) { const n = await conn.read(buf); if (n === null) break; chunks.push(buf.slice(0, n)); }
    const raw = new TextDecoder().decode(chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }));
    const sep = raw.indexOf("\r\n\r\n");
    const hdrs = raw.substring(0, sep);
    const status = parseInt(hdrs.split("\r\n")[0].split(" ")[1] ?? "0", 10);
    let body = raw.substring(sep + 4);
    if (hdrs.toLowerCase().includes("transfer-encoding: chunked")) body = dechunk(body);
    return { status, body };
  } finally { conn.close(); }
}

function dechunk(s: string): string {
  const out: string[] = []; let i = 0;
  while (i < s.length) {
    const end = s.indexOf("\r\n", i); if (end === -1) break;
    const size = parseInt(s.substring(i, end), 16); if (isNaN(size) || size === 0) break;
    out.push(s.substring(end + 2, end + 2 + size)); i = end + 2 + size + 2;
  }
  return out.join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const address    = typeof body.address    === "string" ? body.address.trim()    : "";
    const diagnostic = body.diagnostic === true;
    if (!propertyId) throw new Error("Missing propertyId");
    if (!address)    throw new Error("Missing address");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const geoKey = Deno.env.get("GOOGLE_MAPS_KEY");
    if (!geoKey) throw new Error("GOOGLE_MAPS_KEY not configured");
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${geoKey}&region=nz`);
    const geo = await geoRes.json() as { status?: string; results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
    if (geo.status !== "OK") throw new Error(`Geocode failed: ${geo.status}`);
    const lat = geo.results![0]?.geometry?.location?.lat!;
    const lng = geo.results![0]?.geometry?.location?.lng!;
    const normalized = geo.results![0]?.formatted_address ?? null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Invalid coordinates");

    const linzKey = Deno.env.get("LINZ_API_KEY") ?? "";
    let parcel: Record<string, unknown> | null = null;
    let title:  Record<string, unknown> | null = null;
    let parcelRaw = "", titleRaw = "", parcelStatus = 0, titleStatus = 0;

    if (linzKey) {
      const parse = (text: string) => {
        try { const j = JSON.parse(text) as { features?: Array<{ properties?: unknown }> }; const p = j.features?.[0]?.properties; return p && typeof p === "object" ? p as Record<string, unknown> : null; }
        catch { return null; }
      };
      const spatialCql = `DWITHIN(shape,POINT(${lng} ${lat}),200,meters)`;
      const pr = await linzFetch(linzKey, "layer-50772", spatialCql);
      parcel = parse(pr.body); parcelRaw = pr.body.substring(0, 1000); parcelStatus = pr.status;

      if (parcel?.titles) {
        const titleNo = String(parcel.titles).split(",")[0].trim();
        const tr = await linzFetch(linzKey, "layer-50804", `title_no='${titleNo}'`);
        title = parse(tr.body); titleRaw = tr.body.substring(0, 1000); titleStatus = tr.status;
      } else {
        const tr = await linzFetch(linzKey, "layer-50804", spatialCql);
        title = parse(tr.body); titleRaw = tr.body.substring(0, 1000); titleStatus = tr.status;
      }
    }

    if (diagnostic) {
      return new Response(JSON.stringify({ diagnostic: true, linz_key_length: linzKey.length, coords: { lat, lng }, normalized_address: normalized, parcel_http_status: parcelStatus, parcel_props: parcel, parcel_raw_body: parcelRaw, title_http_status: titleStatus, title_props: title, title_raw_body: titleRaw }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appellation  = parcel?.appellation ? String(parcel.appellation) : title?.estate_description ? String(title.estate_description) : null;
    const areaRaw      = parcel?.calc_area ?? parcel?.survey_area;
    const titleNoVal   = title?.title_no ? String(title.title_no) : (parcel?.titles ? String(parcel.titles).split(",")[0].trim() : null);
    const titleType    = title?.type ? String(title.type) : null;
    const landDistrict = String(title?.land_district ?? parcel?.land_district ?? "") || null;

    const updateData = {
      address_normalized: normalized, latitude: lat, longitude: lng,
      title_number: titleNoVal ?? null, legal_description: appellation,
      estate_type: titleType?.trim() || "Fee Simple",
      land_area_m2: (() => { const n = Number(areaRaw); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; })(),
      linz_parcel_id: parcel?.id ? String(parcel.id) : null,
      data_sources: { linz: Boolean(parcel || title), linz_parcel: Boolean(parcel), linz_title: Boolean(title), geocode: "google", land_district: landDistrict, title_status: title?.status ?? null, parcel_intent: parcel?.parcel_intent ?? null, enriched_at: new Date().toISOString() },
      enriched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("application_properties").update(updateData).eq("id", propertyId);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data: updateData, parcel_found: Boolean(parcel), title_found: Boolean(title) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
