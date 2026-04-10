import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.67.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Picks a numeric income amount from an income row (schema uses gross_salary; tolerate legacy amount). */
function incomeRowAmount(row: { gross_salary?: unknown; amount?: unknown }): number {
  const v = row.gross_salary ?? row.amount;
  return Number(v) || 0;
}

/** Sums dependants across applicants for an application (no separate dependants table in this schema). */
function sumApplicantDependants(
  applicants: { number_of_dependants?: number | null }[] | null,
): number {
  return (applicants || []).reduce((s, a) => s + Number(a.number_of_dependants || 0), 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const applicationId =
      (typeof body.applicationId === "string" && body.applicationId) ||
      (typeof body.dealId === "string" && body.dealId) ||
      "";

    if (!applicationId) {
      throw new Error("Missing applicationId");
    }

    const situationsRaw = body.situations;
    const situations = Array.isArray(situationsRaw)
      ? situationsRaw.filter((x): x is string => typeof x === "string")
      : [];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const [
      appRes,
      incomesRes,
      expensesRes,
      liabilitiesRes,
      assetsRes,
      applicantsRes,
    ] = await Promise.all([
      supabase
        .from("applications")
        .select("id, firm_id, loan_amount, property_value, clients(first_name,last_name)")
        .eq("id", applicationId)
        .single(),
      supabase.from("income").select("gross_salary, amount").eq("application_id", applicationId),
      supabase.from("expenses").select("total_monthly, amount").eq("application_id", applicationId),
      supabase.from("liabilities").select("current_balance, card_limit").eq("application_id", applicationId),
      supabase.from("assets").select("estimated_value, value").eq("application_id", applicationId),
      supabase.from("applicants").select("number_of_dependants").eq("application_id", applicationId),
    ]);

    if (appRes.error || !appRes.data?.firm_id) {
      throw new Error("Application not found or missing firm_id");
    }

    const app = appRes.data;
    const incomes = incomesRes.data;
    const expenses = expensesRes.data;
    const liabilities = liabilitiesRes.data;
    const assets = assetsRes.data;
    const applicants = applicantsRes.data;

    const totalIncome = (incomes || []).reduce((s, i) => s + incomeRowAmount(i), 0);
    const totalExpenses = (expenses || []).reduce((s, e) => {
      const v = e.total_monthly ?? e.amount;
      return s + (Number(v) || 0);
    }, 0);
    const liabilityBalanceOnly = (liabilities || []).reduce(
      (s, l) => s + (Number(l.current_balance) || 0),
      0,
    );
    const totalCardLimits = (liabilities || []).reduce(
      (s, l) => s + (Number(l.card_limit) || 0),
      0,
    );
    const totalAssets = (assets || []).reduce((s, a) => {
      const v = a.estimated_value ?? a.value;
      return s + (Number(v) || 0);
    }, 0);
    const dependantCount = sumApplicantDependants(applicants);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "NZ mortgage underwriter. Return JSON: risk_tier, income_stability_score, key_risks_top5[], underwriting_summary, leverage_metrics{lvr_percent,dti_ratio,lti_ratio,cash_post_settlement,umi_plus2}, strengths[], property_risks[], protection_gaps[], client_complexity",
        },
        {
          role: "user",
          content:
            `Application ${applicationId}. Declared gross income (summed) $${totalIncome}, declared expenses (monthly) $${totalExpenses}, assets $${totalAssets}, liability balances $${liabilityBalanceOnly}, credit card limits total $${totalCardLimits}, dependants ${dependantCount}, loan $${app.loan_amount}, property $${app.property_value}. Situations: ${situations.join(", ")}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const analysis = JSON.parse(raw) as Record<string, unknown>;
    const normalized = {
      ...analysis,
      risk_tier: String(analysis.risk_tier || "medium").toLowerCase(),
      income_stability_score: Number(analysis.income_stability_score) || 0.7,
    };

    const lm = (normalized.leverage_metrics ?? {}) as Record<string, unknown>;
    const propRisks = Array.isArray(normalized.property_risks)
      ? (normalized.property_risks as unknown[]).map(String)
      : [];

    const lvrComputed =
      app.loan_amount && app.property_value
        ? Math.round((Number(app.loan_amount) / Number(app.property_value)) * 100)
        : null;

    const { error } = await supabase.from("soa_client_dna").upsert(
      {
        deal_id: applicationId,
        firm_id: app.firm_id as string,
        analysis: normalized,
        risk_tier: normalized.risk_tier,
        income_stability: normalized.income_stability_score,
        lvr: lvrComputed ?? (lm.lvr_percent != null ? Number(lm.lvr_percent) : null),
        dti: lm.dti_ratio != null ? Number(lm.dti_ratio) : null,
        property_risk_count: propRisks.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "deal_id" },
    );

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(normalized), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
