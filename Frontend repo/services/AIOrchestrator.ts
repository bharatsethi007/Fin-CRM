import { logger } from '../utils/logger';
// ================================================================
// AI ORCHESTRATOR v2
// Central intelligence router for AdvisorFlow
//
// Key improvements over v1:
// 1. Right model for right task — reads from ai_model_config table
// 2. All outputs persist to application_intelligence (central state)
// 3. Never loses data on page refresh
// 4. Learns from advisor overrides
// 5. Full token tracking per model per application
// ================================================================

import { supabase } from './supabaseClient';
import { invokeOpenAIProxy } from './openaiProxy';

export type AIFeature =
  | 'advice_summary' | 'bank_parse' | 'condition_extract'
  | 'document_request' | 'daily_briefing' | 'anomaly_explain'
  | 'refix_email' | 'needs_objectives_draft' | 'serviceability_narrative'
  | 'client_summary' | 'compliance_narrative' | 'decline_risk'
  | 'lender_rationale' | 'checklist_generate';

export interface OrchestratorResult {
  success: boolean;
  data: any;
  cached: boolean;
  tokensUsed: number;
  model: string;
  feature: string;
  error?: string;
}

// ================================================================
// GET MODEL CONFIG FROM DB
// Falls back to gpt-4o-mini if not configured
// ================================================================
async function getModelConfig(feature: string, firmId?: string): Promise<{
  model: string; temperature: number; max_tokens: number;
}> {
  const { data } = await supabase.rpc('get_ai_model', {
    p_feature: feature,
    p_firm_id: firmId || null,
  });
  return data || { model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 1000 };
}

// ================================================================
// BUILD FULL APPLICATION CONTEXT
// Single DB call returns everything — uses our new function
// ================================================================
async function getContext(applicationId: string): Promise<any> {
  const { data } = await supabase.rpc('get_ai_application_context', {
    p_application_id: applicationId,
  });
  return data;
}

type SkillContextRow = {
  has_skills?: boolean;
  context_text?: string;
  instruction?: string;
};

async function getSkillContextForFeature(
  firmId: string | undefined,
  feature: string,
  advisorId: string | undefined,
): Promise<SkillContextRow | null> {
  if (!firmId) return null;
  const { data, error } = await supabase.rpc('get_skill_context_for_feature', {
    p_firm_id: firmId,
    p_feature: feature,
    p_advisor_id: advisorId ?? null,
  });
  if (error) {
    logger.warn('get_skill_context_for_feature:', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  return row as SkillContextRow;
}

async function resolveFirmId(applicationId: string, firmId?: string): Promise<string | undefined> {
  if (firmId) return firmId;
  const { data } = await supabase.from('applications').select('firm_id').eq('id', applicationId).maybeSingle();
  return data?.firm_id ?? undefined;
}

// ================================================================
// GET CACHED OUTPUT FROM CENTRAL INTELLIGENCE STATE
// Reads from application_intelligence table — persists forever
// ================================================================
async function getCentralState(applicationId: string): Promise<any> {
  const { data } = await supabase
    .from('application_intelligence')
    .select('*')
    .eq('application_id', applicationId)
    .single();
  return data;
}

// ================================================================
// CALL OPENAI — works with any model in the gpt family
// ================================================================
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number,
  meta: { feature: string; applicationId: string; firmId?: string },
): Promise<{ content: string; promptTokens: number; completionTokens: number; durationMs: number }> {
  const start = Date.now();
  const { content, promptTokens, completionTokens } = await invokeOpenAIProxy(
    {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    { feature: meta.feature, applicationId: meta.applicationId, firmId: meta.firmId },
  );
  return {
    content,
    promptTokens,
    completionTokens,
    durationMs: Date.now() - start,
  };
}

// ================================================================
// PARSE JSON SAFELY
// ================================================================
function parseJSON(text: string): any {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { raw: text };
  }
}

// ================================================================
// PERSIST OUTPUT TO CENTRAL INTELLIGENCE STATE
// ================================================================
async function persistOutput(
  applicationId: string,
  feature: string,
  output: any,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<void> {
  // Save to ai_outputs (audit trail)
  const { data: appData } = await supabase
    .from('applications')
    .select('firm_id')
    .eq('id', applicationId)
    .single();

  if (appData?.firm_id) {
    await supabase.from('ai_outputs').insert({
      application_id: applicationId,
      firm_id: appData.firm_id,
      feature,
      output_json: output,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      model_used: model,
      cache_valid: true,
      cache_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      pii_stripped: true,
    });

    // Save to central intelligence state
    await supabase.rpc('save_intelligence_output', {
      p_application_id: applicationId,
      p_feature: feature,
      p_output: output,
      p_model: model,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
    });
  }
}

// ================================================================
// PROMPT BUILDERS
// Inline here for clarity — import from aiPrompts.ts in production
// ================================================================
const SYSTEM_BASE = `You are an AI assistant in AdvisorFlow, a NZ mortgage broker CRM.
All outputs are AI-assisted suggestions. The licensed adviser must review before use.
Comply with CCCFA 2003, FMC Act 2013, Financial Advisers Act 2008.
Respond only with valid JSON. No markdown, no preamble.`;

function buildPrompt(feature: AIFeature, ctx: any, options: any): { system: string; user: string } {
  const system = SYSTEM_BASE;

  const ctxSummary = `Application context:
- Loan: $${ctx?.loan_amount?.toLocaleString()} ${ctx?.application_type} for ${ctx?.loan_purpose}
- Income: $${ctx?.gross_annual_income?.toLocaleString()}/yr | Net: $${ctx?.net_monthly_income?.toLocaleString()}/mth
- UMI: $${ctx?.umi_monthly?.toLocaleString()}/mth | DTI: ${ctx?.dti_ratio?.toFixed(1)}x | LVR: ${ctx?.lvr_percent?.toFixed(0)}%
- Serviceability: ${ctx?.passes_serviceability ? 'PASSES' : 'FAILS'}
- Readiness: Grade ${ctx?.readiness_grade} (${ctx?.readiness_score}/100)
- Anomalies: ${ctx?.anomaly_count} open
${ctx?.decline_risk_factors?.length > 0 ? '- Risk factors: ' + ctx.decline_risk_factors.map((r: any) => r.description).join('; ') : ''}
${ctx?.relevant_lender_policies?.length > 0 ? '- Lender policies retrieved: ' + ctx.relevant_lender_policies.map((p: any) => p.category + ': ' + p.summary).join(' | ') : ''}
${ctx?.lender_win_rates?.length > 0 ? '- Historical win rates: ' + ctx.lender_win_rates.map((w: any) => w.lender + ' ' + w.approval_rate_pct + '%').join(', ') : ''}`;

  const prompts: Record<AIFeature, string> = {
    advice_summary: `${ctxSummary}
Lender: ${options.selectedLender || ctx?.decline_risk_recommended_lender || 'ANZ'}
Return JSON: { "lender_recommendation": "", "confidence": "high|medium|low", "why_this_lender": "", "why_not_others": "", "how_meets_client_needs": "", "policy_fit_notes": "", "risks_to_disclose": [], "conditions_likely": [], "adviser_notes": "", "compliance_statement": "" }`,

    compliance_narrative: `${ctxSummary}
Write a CCCFA affordability assessment narrative.
Return JSON: { "affordability_summary": "", "income_assessment": "", "expense_assessment": "", "net_position": "", "stress_test_result": "", "cccfa_conclusion": "suitable|not_suitable|borderline", "adviser_declaration": "" }`,

    needs_objectives_draft: `${ctxSummary}
Return JSON: { "primary_objective": "", "secondary_objectives": [], "needs_identified": [], "why_this_loan_type": "", "alternatives_considered": "", "risk_acknowledgements": [], "adviser_declaration": "", "cccfa_affordability_note": "" }`,

    serviceability_narrative: `${ctxSummary}
Return JSON: { "narrative": "", "key_strengths": [], "key_risks": [], "lender_view": "" }`,

    bank_parse: `${options.statementText || 'No text provided'}
Extract NZ bank statement data. Return JSON: { "bank_name": "", "statement_period": "", "account_holder": "REDACTED", "income": [{"description":"","amount":0,"frequency":"monthly","income_type":"salary_wages","confidence":"high"}], "expenses": {"food_groceries":0,"dining_takeaway":0,"alcohol_tobacco":0,"entertainment":0,"streaming_subscriptions":0,"clothing_personal":0,"phone_internet":0,"utilities":0,"vehicle_running_costs":0,"public_transport":0,"health_insurance":0,"medical_dental":0,"gym_sports":0,"rent_board":0,"other_discretionary":0}, "red_flags": [], "undisclosed_repayments": [], "notes": "" }`,

    condition_extract: `${options.letterText || 'No text provided'}
Extract conditions from approval letter. Return JSON: { "lender_name": "", "approval_amount": 0, "expiry_date": null, "interest_rate": 0, "conditions": [{"number":1,"text":"","category":"income","responsible_party":"borrower","priority":"high","estimated_days_to_satisfy":5,"requires_document":true,"document_description":""}], "notes": "" }`,

    document_request: `Client first name: ${options.clientFirstName || 'there'}. Missing: ${options.missingDocs?.join(', ') || 'various documents'}. Application: ${ctx?.application_type}.
Return JSON: { "subject": "", "body": "", "urgency": "standard|urgent" }`,

    daily_briefing: `Adviser: ${options.advisorName}. Stats: ${JSON.stringify(options.dailyStats || {})}.
Return JSON: { "greeting": "", "headline": "", "summary": "", "priority_actions": [{"rank":1,"action":"","reason":"","urgency":"high","estimated_minutes":0}], "opportunity": "", "compliance_reminder": "" }`,

    anomaly_explain: `Anomaly: ${options.anomaly?.title}. Detail: ${options.anomaly?.description}. Severity: ${options.anomaly?.severity}. ${ctxSummary}
Return JSON: { "plain_english": "", "lender_impact": "", "suggested_fix": "", "cccfa_relevance": "", "urgency": "", "broker_script": "" }`,

    refix_email: `Client: ${options.clientFirstName}. Lender: ${options.refixParams?.lenderName}. Current: ${options.refixParams?.currentRate}%. Market best: ${options.refixParams?.marketBestRate}%. Days until expiry: ${options.refixParams?.daysUntilExpiry}. Balance: $${options.refixParams?.loanBalance?.toLocaleString()}.
Return JSON: { "subject": "", "body": "", "call_to_action": "" }`,

    client_summary: `${ctxSummary}
Return JSON: { "summary": "", "next_steps": [], "estimated_timeline": "" }`,

    lender_rationale: `${ctxSummary}\nLender: ${options.selectedLender}
Return JSON: { "rationale": "", "policy_alignment": "", "key_selling_points": [], "watch_points": [] }`,

    decline_risk: `${ctxSummary}\nTarget lender: ${options.selectedLender}
Return JSON: { "risk_level": "high|medium|low", "approval_probability_pct": 0, "main_risks": [], "lender_policy_conflicts": [], "what_to_fix": [], "alternative_lenders": [] }`,

    checklist_generate: `${ctxSummary}
Return JSON: { "checklist": [{"item":"","required":true,"category":"","reason":""}] }`,
  };

  return { system, user: prompts[feature] || 'Feature not implemented' };
}

// ================================================================
// MAIN RUN FUNCTION
// ================================================================
export const AIOrchestrator = {

  async run(
    feature: AIFeature,
    applicationId: string,
    options: {
      firmId?: string;
      advisorId?: string;
      forceRefresh?: boolean;
      selectedLender?: string;
      clientFirstName?: string;
      bankStatementText?: string;
      approvalLetterText?: string;
      anomaly?: { title: string; description: string; severity: string };
      advisorName?: string;
      dailyStats?: any;
      refixParams?: any;
      missingDocs?: string[];
    } = {}
  ): Promise<OrchestratorResult> {
    try {
      // Check central intelligence state for cached output first
      if (!options.forceRefresh) {
        const state = await getCentralState(applicationId);
        const fieldMap: Record<string, string> = {
          advice_summary: 'advice_summary',
          compliance_narrative: 'compliance_narrative',
          serviceability_narrative: 'serviceability_narrative',
          document_request: 'document_request_draft',
          daily_briefing: 'daily_briefing',
          needs_objectives_draft: 'needs_objectives_draft',
          client_summary: 'client_summary',
        };
        const cachedField = fieldMap[feature];
        if (cachedField && state?.[cachedField]) {
          return { success: true, data: state[cachedField], cached: true, tokensUsed: 0, model: 'cached', feature };
        }
      }

      // Get model config from DB
      const modelConfig = await getModelConfig(feature, options.firmId);

      // Build full context
      const ctx = await getContext(applicationId);

      // Build prompt
      const { system, user } = buildPrompt(feature, ctx, {
        ...options,
        statementText: options.bankStatementText,
        letterText: options.approvalLetterText,
      });

      const firmIdResolved = await resolveFirmId(applicationId, options.firmId);
      const skillContext = await getSkillContextForFeature(firmIdResolved, feature, options.advisorId);

      let systemPrompt = system;
      if (skillContext?.has_skills) {
        systemPrompt = `${system}

## FIRM AI SKILLS — APPLY THESE TO YOUR OUTPUT
${skillContext.context_text ?? ''}

${skillContext.instruction ?? ''}
`;
      }

      // Call correct OpenAI model
      const { content, promptTokens, completionTokens } = await callOpenAI(
        systemPrompt,
        user,
        modelConfig.model,
        modelConfig.max_tokens,
        modelConfig.temperature,
        { feature, applicationId, firmId: firmIdResolved },
      );

      if (skillContext?.has_skills && firmIdResolved) {
        try {
          await supabase.from('ai_skill_usage_log').insert({
            skill_id: null,
            firm_id: firmIdResolved,
            advisor_id: options.advisorId ?? null,
            application_id: applicationId,
            feature: feature,
          });
        } catch (e) {
          logger.warn('ai_skill_usage_log insert:', e);
        }
      }

      // Parse
      const parsed = parseJSON(content);

      // Persist to central intelligence state
      await persistOutput(applicationId, feature, parsed, modelConfig.model, promptTokens, completionTokens);

      return {
        success: true,
        data: parsed,
        cached: false,
        tokensUsed: promptTokens + completionTokens,
        model: modelConfig.model,
        feature,
      };

    } catch (e: any) {
      logger.error('AIOrchestrator error:', feature, e);
      return { success: false, data: null, cached: false, tokensUsed: 0, model: 'none', feature, error: e.message };
    }
  },

  // Get the full central intelligence state for an application
  async getState(applicationId: string) {
    return getCentralState(applicationId);
  },

  // Record when advisor overrides an AI suggestion — feeds learning
  async recordOverride(applicationId: string, field: string, aiSuggested: any, advisorChose: any) {
    await supabase.from('application_intelligence').update({
      advisor_overrides: supabase.rpc('array_append_jsonb', {
        p_table: 'application_intelligence',
        p_column: 'advisor_overrides',
        p_application_id: applicationId,
        p_value: { field, ai_suggested: aiSuggested, advisor_chose: advisorChose, timestamp: new Date().toISOString() },
      }),
    }).eq('application_id', applicationId);
  },

  // Fetch the right model for a feature (for UI display)
  async getModelForFeature(feature: string, firmId?: string) {
    return getModelConfig(feature, firmId);
  },
};
