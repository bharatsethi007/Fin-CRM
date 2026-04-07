import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AKAHU_APP_TOKEN = Deno.env.get("AKAHU_APP_TOKEN")!;
const AKAHU_APP_SECRET = Deno.env.get("AKAHU_APP_SECRET")!;
const APP_URL = Deno.env.get("APP_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const AKAHU_BASE = "https://api.akahu.io/v1";
const akahuHeaders = (token?: string) => ({
  "Authorization": token ? `Bearer ${token}` : `Bearer ${AKAHU_APP_TOKEN}`,
  "X-Akahu-ID": AKAHU_APP_TOKEN,
  "Content-Type": "application/json",
});

// NZ merchant category mapping
const CCCFA_CATEGORY_MAP: Record<string, string> = {
  "countdown": "food_groceries", "pak n save": "food_groceries", "new world": "food_groceries",
  "z energy": "transport", "bp ": "transport", "mobil": "transport",
  "afterpay": "bnpl", "laybuy": "bnpl", "humm": "bnpl", "zip": "bnpl",
  "tab ": "gambling", "casino": "gambling", "sky city": "gambling",
  "winz": "income_benefit", "work and income": "income_benefit",
  "dishonour": "dishonour_fee", "honour fee": "dishonour_fee",
  "kfc": "dining_takeaway", "mcdonald": "dining_takeaway", "subway": "dining_takeaway",
};

function categorise(description: string): { category: string; flag: boolean } {
  const lower = description.toLowerCase();
  for (const [keyword, category] of Object.entries(CCCFA_CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      const flagged = ["bnpl", "gambling", "dishonour_fee"].includes(category);
      return { category, flag: flagged };
    }
  }
  return { category: "other", flag: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json();
  const { action, application_id, firm_id, client_email, connection_id } = body;

  // ── CONNECT: Generate OAuth URL ──────────────────────────────
  if (action === "connect") {
    const redirectUri = `${SUPABASE_URL}/functions/v1/akahu-sync/callback`;
    const state = `${application_id}:${firm_id}`;
    const { data: conn } = await supabase.from("akahu_connections").insert({
      application_id, firm_id, status: "pending",
      consent_given: false, sync_from_date: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
    }).select("id").single();
    const authUrl = `https://oauth.akahu.io/?client_id=${AKAHU_APP_TOKEN}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=ENDURING_CONSENT&state=${state}:${conn?.id}`;
    return new Response(JSON.stringify({ consent_url: authUrl, connection_id: conn?.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── CALLBACK: Exchange code for token ────────────────────────
  if (action === "callback") {
    const { code, state } = body;
    const [app_id, firm_id_cb, conn_id] = state.split(":");
    const tokenRes = await fetch(`${AKAHU_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: `${SUPABASE_URL}/functions/v1/akahu-sync/callback`, client_id: AKAHU_APP_TOKEN, client_secret: AKAHU_APP_SECRET }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return new Response("Token exchange failed", { status: 400, headers: cors });
    const userRes = await fetch(`${AKAHU_BASE}/me`, { headers: akahuHeaders(tokenData.access_token) });
    const userData = await userRes.json();
    await supabase.from("akahu_connections").update({
      akahu_user_token: tokenData.access_token, status: "active",
      consent_given: true, consent_given_at: new Date().toISOString(),
      akahu_user_id: userData.item?._id,
      bank_holder_name: userData.item?.name,
    }).eq("id", conn_id);
    return new Response(null, { status: 302, headers: { ...cors, Location: `${APP_URL}/settings?akahu=connected` } });
  }

  // ── FETCH: Pull transactions ─────────────────────────────────
  if (action === "fetch") {
    const { data: conn } = await supabase.from("akahu_connections")
      .select("*").eq("id", connection_id).single();
    if (!conn?.akahu_user_token) return new Response("No active connection", { status: 400, headers: cors });

    const accountsRes = await fetch(`${AKAHU_BASE}/accounts`, { headers: akahuHeaders(conn.akahu_user_token) });
    const accounts = await accountsRes.json();
    const fromDate = conn.sync_from_date || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    let allTransactions: any[] = [];
    for (const account of (accounts.items || [])) {
      const txRes = await fetch(`${AKAHU_BASE}/accounts/${account._id}/transactions?start=${fromDate}`, { headers: akahuHeaders(conn.akahu_user_token) });
      const txData = await txRes.json();
      allTransactions = allTransactions.concat(txData.items || []);
    }

    // Upsert transactions
    let credits = 0, debits = 0, flagCount = 0;
    const toInsert = allTransactions.map(tx => {
      const { category, flag } = categorise(tx.description || "");
      if (tx.amount > 0) credits += tx.amount; else debits += Math.abs(tx.amount);
      if (flag) flagCount++;
      return {
        application_id: conn.application_id, firm_id: conn.firm_id,
        akahu_transaction_id: tx._id, akahu_connection_id: connection_id,
        transaction_date: tx.date?.split("T")[0], description: tx.description,
        amount: tx.amount, type: tx.amount > 0 ? "credit" : "debit",
        cccfa_category: category, is_flagged: flag,
        merchant_name: tx.merchant?.name,
      };
    });

    if (toInsert.length > 0) {
      await supabase.from("akahu_transactions").upsert(toInsert, { onConflict: "akahu_transaction_id" });
    }

    // Update connection sync timestamp
    await supabase.from("akahu_connections").update({ last_synced_at: new Date().toISOString(), sync_to_date: new Date().toISOString().split("T")[0] }).eq("id", connection_id);

    return new Response(JSON.stringify({ synced: toInsert.length, credits, debits, flags: flagCount }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── REVOKE: Delete token ─────────────────────────────────────
  if (action === "revoke") {
    const { data: conn } = await supabase.from("akahu_connections").select("akahu_user_token").eq("id", connection_id).single();
    if (conn?.akahu_user_token) {
      await fetch(`${AKAHU_BASE}/token`, { method: "DELETE", headers: akahuHeaders(conn.akahu_user_token) });
    }
    await supabase.from("akahu_connections").update({ status: "revoked", akahu_user_token: null }).eq("id", connection_id);
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response("Unknown action", { status: 400, headers: cors });
});
