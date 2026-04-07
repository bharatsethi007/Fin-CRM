import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("XERO_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET")!;
const REDIRECT_URI = Deno.env.get("XERO_REDIRECT_URI")!;
const APP_URL = Deno.env.get("APP_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const SCOPES = "openid profile email accounting.transactions accounting.contacts offline_access";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop() || "";

  // ── POST: connect / disconnect / refresh (JSON body) ─────────
  if (req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body */
    }
    const firm_id = body.firm_id as string | undefined;
    const action = body.action as string | undefined;

    if (action === "connect" && firm_id) {
      const state = `${firm_id}:${crypto.randomUUID()}`;
      const authUrl =
        `${XERO_AUTH_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(state)}`;
      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect" && firm_id) {
      const { data: config } = await supabase.from("xero_config").select("xero_access_token").eq("firm_id", firm_id).single();
      if (config?.xero_access_token) {
        await fetch("https://identity.xero.com/connect/revocation", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({ token: config.xero_access_token, token_type_hint: "access_token" }),
        }).catch(() => {});
      }
      await supabase.from("xero_config").update({
        connected: false,
        xero_access_token: null,
        xero_refresh_token: null,
        xero_tenant_id: null,
        xero_org_name: null,
        updated_at: new Date().toISOString(),
      }).eq("firm_id", firm_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (path === "refresh" && firm_id) {
      const { data: config } = await supabase.from("xero_config").select("*").eq("firm_id", firm_id).single();
      if (!config?.xero_refresh_token) {
        return new Response("Not connected", { status: 400, headers: cors });
      }
      const expiry = new Date(config.xero_token_expires_at);
      if (expiry > new Date(Date.now() + 5 * 60 * 1000)) {
        return new Response(JSON.stringify({ access_token: config.xero_access_token }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const refreshRes = await fetch(XERO_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.xero_refresh_token }),
      });
      const newTokens = await refreshRes.json();
      await supabase.from("xero_config").update({
        xero_access_token: newTokens.access_token,
        xero_refresh_token: newTokens.refresh_token,
        xero_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      }).eq("firm_id", firm_id);
      return new Response(JSON.stringify({ access_token: newTokens.access_token }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  // ── CALLBACK: Exchange code ───────────────────────────────────
  if (path === "callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "";
    const firm_id = state.split(":")[0];
    if (!code || !firm_id) return new Response("Invalid callback", { status: 400, headers: cors });

    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return new Response("Token exchange failed", { status: 400, headers: cors });

    const connsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { "Authorization": `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
    });
    const conns = await connsRes.json();
    const tenant = Array.isArray(conns) ? conns[0] : null;

    await supabase.from("xero_config").upsert({
      firm_id,
      xero_tenant_id: tenant?.tenantId,
      xero_org_name: tenant?.tenantName,
      xero_access_token: tokens.access_token,
      xero_refresh_token: tokens.refresh_token,
      xero_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      connected: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "firm_id" });

    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: `${APP_URL}/commission?tab=settings&xero_connected=true` },
    });
  }

  return new Response("Unknown route", { status: 404, headers: cors });
});
