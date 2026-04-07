import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const XERO_API = "https://api.xero.com/api.xro/2.0";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { firm_id, commission_ids } = await req.json();

  // Get Xero config + refresh token
  const { data: config } = await supabase.from("xero_config").select("*").eq("firm_id", firm_id).single();
  if (!config?.connected) return new Response(JSON.stringify({ error: "Xero not connected" }), { status: 400, headers: cors });

  // Refresh token via xero-oauth function
  const refreshRes = await fetch(`${SUPABASE_URL}/functions/v1/xero-oauth/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ firm_id }),
  });
  const { access_token } = await refreshRes.json();
  const xeroHeaders = { "Authorization": `Bearer ${access_token}`, "xero-tenant-id": config.xero_tenant_id, "Content-Type": "application/json", "Accept": "application/json" };

  // Load commissions to sync
  let query = supabase.from("commissions").select("*, clients(first_name, last_name)").eq("firm_id", firm_id).is("xero_invoice_id", null).eq("status", "received");
  if (commission_ids?.length) query = query.in("id", commission_ids);
  const { data: commissions } = await query;
  if (!commissions?.length) return new Response(JSON.stringify({ synced: 0, message: "No commissions to sync" }), { headers: { ...cors, "Content-Type": "application/json" } });

  let synced = 0, failed = 0;
  const errors: string[] = [];
  const prefix = config.contact_name_prefix || "Commission - ";

  for (const commission of commissions) {
    try {
      const contactName = `${prefix}${commission.lender_name}`;
      // Find or create Xero contact
      const contactSearch = await fetch(`${XERO_API}/Contacts?where=Name%3D%22${encodeURIComponent(contactName)}%22`, { headers: xeroHeaders });
      const contactData = await contactSearch.json();
      let contactId = contactData.Contacts?.[0]?.ContactID;

      if (!contactId) {
        const createContact = await fetch(`${XERO_API}/Contacts`, {
          method: "POST", headers: xeroHeaders,
          body: JSON.stringify({ Contacts: [{ Name: contactName, IsCustomer: true }] }),
        });
        const newContact = await createContact.json();
        contactId = newContact.Contacts?.[0]?.ContactID;
      }

      const clientName = commission.clients ? `${commission.clients.first_name} ${commission.clients.last_name}` : "Client";
      // Create invoice
      const invoiceRes = await fetch(`${XERO_API}/Invoices`, {
        method: "POST", headers: xeroHeaders,
        body: JSON.stringify({
          Invoices: [{
            Type: "ACCREC", Status: "AUTHORISED",
            Contact: { ContactID: contactId },
            Date: commission.settlement_date,
            DueDate: commission.expected_date,
            Reference: `Commission - ${commission.lender_name} - ${clientName}`,
            LineAmountTypes: "EXCLUSIVE",
            LineItems: [{
              Description: `${commission.commission_type} commission - ${commission.lender_name} - Loan $${Number(commission.loan_amount).toLocaleString("en-NZ")}`,
              Quantity: 1.0, UnitAmount: Number(commission.gross_amount),
              AccountCode: config.income_account_code || "200",
              TaxType: "OUTPUT2",
            }],
          }],
        }),
      });
      const invoiceData = await invoiceRes.json();
      const invoiceId = invoiceData.Invoices?.[0]?.InvoiceID;

      if (invoiceId) {
        await supabase.from("commissions").update({ xero_invoice_id: invoiceId, xero_synced_at: new Date().toISOString(), xero_status: "AUTHORISED" }).eq("id", commission.id);
        await supabase.from("xero_sync_log").insert({ firm_id, commission_id: commission.id, xero_invoice_id: invoiceId, action: "create_invoice", status: "success", response_payload: invoiceData.Invoices?.[0] });
        synced++;
      } else {
        throw new Error(JSON.stringify(invoiceData));
      }
    } catch (err: any) {
      failed++;
      errors.push(`${commission.lender_name}: ${err.message}`);
      await supabase.from("xero_sync_log").insert({ firm_id, commission_id: commission.id, action: "create_invoice", status: "failed", error_message: err.message });
    }
  }

  await supabase.from("xero_config").update({ last_synced_at: new Date().toISOString(), total_synced: (config.total_synced || 0) + synced }).eq("firm_id", firm_id);
  return new Response(JSON.stringify({ synced, failed, errors }), { headers: { ...cors, "Content-Type": "application/json" } });
});
