import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { revokeAkahuTokensForFirm } from "../_shared/revokeAkahuForFirm.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Deletes the authenticated advisor: revokes Akahu tokens for their firm first,
 * removes the `advisors` row, then deletes the auth user (admin API).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const akahuAppToken = Deno.env.get("AKAHU_APP_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!akahuAppToken) {
      return new Response(
        JSON.stringify({ error: "AKAHU_APP_TOKEN is not set" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: advisor, error: advErr } = await admin
      .from("advisors")
      .select("firm_id")
      .eq("id", user.id)
      .maybeSingle();

    if (advErr || !advisor?.firm_id) {
      return new Response(JSON.stringify({ error: "Advisor not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const akahu = await revokeAkahuTokensForFirm(
      admin,
      advisor.firm_id,
      akahuAppToken,
    );

    if (akahu.failed.length > 0) {
      return new Response(
        JSON.stringify({
          error:
            "Could not revoke all Akahu bank connections. Fix or retry before deleting your account.",
          akahu,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: delAdvErr } = await admin
      .from("advisors")
      .delete()
      .eq("id", user.id);

    if (delAdvErr) {
      return new Response(
        JSON.stringify({
          error: `Failed to remove advisor: ${delAdvErr.message}`,
          akahu,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: delAuthErr } = await admin.auth.admin.deleteUser(user.id);
    if (delAuthErr) {
      return new Response(
        JSON.stringify({
          error: `Advisor removed but auth delete failed: ${delAuthErr.message}`,
          akahu,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, akahu }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
