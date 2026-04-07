// ================================================================
// AI PROMPT TEMPLATES v2
// Updated to use RAG lender policies, decline risk, win rates
// All prompts NZ-compliant: CCCFA/FMA/FAA
// PII stripped before these are built
// ================================================================

export const SYSTEM_BASE = `You are an AI assistant embedded in AdvisorFlow, a NZ mortgage broker CRM.
You assist licensed financial advisers preparing mortgage applications.
All outputs are AI-assisted suggestions only. The licensed adviser must review, verify,
and take responsibility for all advice given to clients.
You must comply with: CCCFA 2003, Financial Markets Conduct Act 2013, Financial Advisers Act 2008.
Never recommend a specific product without noting adviser review is required.
Respond only with valid JSON unless instructed otherwise.
Do not include PII in outputs.`;

// ================================================================
// ENRICHED ADVICE SUMMARY — now uses policies + win rates
// ================================================================
export function buildAdviceSummaryPrompt(ctx: any, selectedLender: string): string {
  const winRates = ctx.lender_win_rates || [];
  const policies = ctx.relevant_lender_policies || [];
  const riskFactors = ctx.decline_risk_factors || [];

  const winRateText = winRates.length > 0
    ? 'Historical win rates at this firm: ' + winRates.map((w: any) =>
        w.lender + ' ' + w.approval_rate_pct + '% (' + w.total_applications + ' applications)'
      ).join(', ')
    : 'No historical data yet — based on policy analysis only';

  const policyText = policies.length > 0
    ? 'Relevant ' + selectedLender + ' policies:\n' + policies.map((p: any) =>
        '- ' + p.category + ': ' + p.summary
      ).join('\n')
    : '';

  const riskText = riskFactors.length > 0
    ? 'Known risk factors: ' + riskFactors.map((r: any) => r.description).join('; ')
    : 'No major risk factors identified';

  return `${SYSTEM_BASE}

Application context (no PII):
- Loan: $${ctx.loan_amount?.toLocaleString()} ${ctx.application_type} for ${ctx.loan_purpose}
- Income: $${ctx.gross_annual_income?.toLocaleString()}/yr | Net: $${ctx.net_monthly_income?.toLocaleString()}/mth
- Expenses: $${ctx.expenses_used_monthly?.toLocaleString()}/mth (HEM applied if higher than declared)
- UMI: $${ctx.umi_monthly?.toLocaleString()}/mth | DTI: ${ctx.dti_ratio?.toFixed(1)}x | LVR: ${ctx.lvr_percent?.toFixed(0)}%
- Serviceability: ${ctx.passes_serviceability ? 'PASSES' : 'FAILS'} at 8.5% stress rate
- Readiness: Grade ${ctx.readiness_grade} (${ctx.readiness_score}/100)
- Income stability: ${ctx.income_stability_score}/100
- Open anomalies: ${ctx.anomaly_count}
- Selected lender: ${selectedLender}
- AI approval probability: ${ctx.decline_risk_approval_probability ? Math.round(ctx.decline_risk_approval_probability * 100) + '%' : 'unknown'}

${winRateText}

${policyText}

${riskText}

${ctx.advisor_preferences?.preferred_lenders ? 'Adviser preferences: ' + JSON.stringify(ctx.advisor_preferences.preferred_lenders) : ''}

Return JSON:
{
  "lender_recommendation": "${selectedLender}",
  "confidence": "high|medium|low",
  "why_this_lender": "2-3 sentences — reference specific policy fit",
  "why_not_others": "1-2 sentences on alternatives",
  "how_meets_client_needs": "How loan meets client needs and objectives",
  "policy_fit_notes": "Specific policy requirements that apply",
  "risks_to_disclose": ["risks adviser must disclose"],
  "conditions_likely": ["conditions lender is likely to impose based on profile"],
  "adviser_notes": "CCCFA/FMA compliance notes",
  "compliance_statement": "AI-assisted output — licensed adviser must review and take responsibility before providing to client"
}`;
}

// ================================================================
// DAILY BRIEFING — uses pre-aggregated dashboard view
// ================================================================
export function buildDailyBriefingPrompt(advisorName: string, stats: {
  overdue_tasks: number;
  due_today: number;
  stale_applications: number;
  pending_submissions: number;
  critical_clients: number;
  expiring_rates: number;
  compliance_gaps: number;
  urgent_insights: number;
}): string {
  return `${SYSTEM_BASE}

Generate a concise, actionable morning briefing for NZ mortgage adviser: ${advisorName}

Today's stats:
- Overdue tasks: ${stats.overdue_tasks}
- Tasks due today: ${stats.due_today}
- Stale applications (7+ days): ${stats.stale_applications}
- Pending lender responses: ${stats.pending_submissions}
- Critical retention risk clients: ${stats.critical_clients}
- Rate expiries in 30 days: ${stats.expiring_rates}
- Compliance gaps: ${stats.compliance_gaps}
- Urgent AI insights: ${stats.urgent_insights}

Return JSON:
{
  "greeting": "Good morning ${advisorName}",
  "headline": "One sentence — most important thing today",
  "summary": "2 sentences — overall state of the book",
  "priority_actions": [
    {
      "rank": 1,
      "action": "Specific action",
      "reason": "Why priority",
      "urgency": "critical|high|medium",
      "estimated_minutes": 0
    }
  ],
  "opportunity": "One proactive opportunity the adviser may have missed",
  "compliance_reminder": "Relevant daily CCCFA/FMA reminder",
  "stats_summary": "Key numbers in one line"
}`;
}

// ================================================================
// DECLINE RISK EXPLANATION
// Uses risk factors + lender policies to explain in plain English
// ================================================================
export function buildDeclineRiskPrompt(ctx: any, targetLender: string): string {
  return `${SYSTEM_BASE}

Explain the decline risk for this mortgage application at ${targetLender} in plain English.

Application profile:
- DTI: ${ctx.dti_ratio?.toFixed(1)}x | LVR: ${ctx.lvr_percent?.toFixed(0)}% | UMI: $${ctx.umi_monthly?.toLocaleString()}/mth
- Anomalies: ${ctx.anomaly_count} open flags
- Readiness: Grade ${ctx.readiness_grade}
- Risk factors: ${(ctx.decline_risk_factors || []).map((r: any) => r.description).join('; ') || 'none identified'}

Lender policies:
${(ctx.relevant_lender_policies || []).map((p: any) => '- ' + p.category + ': ' + p.summary).join('\n') || 'No policy data available'}

Return JSON:
{
  "risk_level": "high|medium|low",
  "approval_probability_pct": 0,
  "main_risks": ["list of main risk factors"],
  "lender_policy_conflicts": ["specific policy requirements not met"],
  "what_to_fix": ["actionable steps to improve chances"],
  "alternative_lenders": ["better options and why"],
  "adviser_note": "What to tell the lender proactively"
}`;
}

// ================================================================
// BANK STATEMENT PARSE
// ================================================================
export function buildBankParsePrompt(): string {
  return `${SYSTEM_BASE}

Analyse this NZ bank statement. Extract all financial data for mortgage assessment.
All amounts in NZD monthly averages. Do not include account holder name (PII).

Return JSON:
{
  "bank_name": "string",
  "statement_period": "string",
  "account_holder": "REDACTED",
  "income": [
    {
      "description": "e.g. Regular salary credit",
      "amount": 0,
      "frequency": "weekly|fortnightly|monthly|annually",
      "income_type": "salary_wages|self_employed|rental|other",
      "confidence": "high|medium|low"
    }
  ],
  "expenses": {
    "food_groceries": 0, "dining_takeaway": 0, "alcohol_tobacco": 0,
    "entertainment": 0, "streaming_subscriptions": 0, "clothing_personal": 0,
    "phone_internet": 0, "utilities": 0, "vehicle_running_costs": 0,
    "public_transport": 0, "health_insurance": 0, "medical_dental": 0,
    "gym_sports": 0, "rent_board": 0, "other_discretionary": 0
  },
  "income_stability": {
    "trend": "increasing|stable|decreasing|volatile",
    "variance_pct": 0,
    "regular_monthly": 0,
    "irregular_monthly": 0
  },
  "cash_flow": {
    "avg_monthly_surplus": 0,
    "lowest_month_balance": 0,
    "months_analysed": 0
  },
  "risk_flags": {
    "has_gambling": false,
    "has_overdraft_fees": false,
    "has_dishonour_fees": false,
    "has_bnpl": false,
    "has_payday_loans": false,
    "has_large_unexplained_cash": false
  },
  "red_flags": ["plain English list of concerns"],
  "undisclosed_repayments": [
    { "description": "string", "amount": 0, "frequency": "string" }
  ],
  "lender_signals": ["what a lender would flag from this statement"],
  "notes": "Brief financial health assessment — no PII"
}`;
}

// ================================================================
// CONDITION EXTRACTOR
// ================================================================
export function buildConditionExtractPrompt(): string {
  return `${SYSTEM_BASE}

Extract all conditions from this conditional approval letter.

Return JSON:
{
  "lender_name": "string",
  "approval_amount": 0,
  "approval_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "interest_rate": 0,
  "conditions": [
    {
      "number": 1,
      "text": "Full condition text",
      "category": "income|property|insurance|legal|identity|other",
      "responsible_party": "borrower|broker|solicitor|lender",
      "priority": "critical|high|medium|low",
      "estimated_days_to_satisfy": 0,
      "requires_document": true,
      "document_description": "What document is needed if any"
    }
  ],
  "total_conditions": 0,
  "critical_deadline": "YYYY-MM-DD or null",
  "notes": "Any time-sensitive or unusual conditions"
}`;
}

// ================================================================
// DOCUMENT REQUEST EMAIL
// ================================================================
export function buildDocumentRequestPrompt(
  clientFirstName: string,
  missingDocs: string[],
  applicationType: string,
  isSelfEmployed: boolean
): string {
  return `${SYSTEM_BASE}

Write a professional, warm email requesting missing mortgage documents from a NZ client.
Client first name: ${clientFirstName}
Application type: ${applicationType}
Missing: ${missingDocs.join(', ')}
${isSelfEmployed ? 'Note: self-employed — include reminder about accountant-prepared financials.' : ''}

Return JSON:
{
  "subject": "string",
  "body": "Full email. Warm NZ tone. Explain why each document is needed briefly. Include what to do if they have trouble obtaining any document.",
  "urgency": "standard|urgent",
  "estimated_collection_days": 0
}`;
}

// ================================================================
// REFIX EMAIL
// ================================================================
export function buildRefixEmailPrompt(
  clientFirstName: string,
  lenderName: string,
  currentRate: number,
  marketBestRate: number,
  daysUntilExpiry: number,
  loanBalance: number
): string {
  const monthlySaving = Math.round(loanBalance * ((currentRate - marketBestRate) / 100) / 12);
  return `${SYSTEM_BASE}

Write a rate refix opportunity email from NZ mortgage adviser to client.
Client first name: ${clientFirstName}
Lender: ${lenderName}
Current rate: ${currentRate}%
Best available rate: ${marketBestRate}%
Days until expiry: ${daysUntilExpiry}
Approximate loan balance: $${loanBalance?.toLocaleString()}
Estimated monthly saving: $${monthlySaving}

Return JSON:
{
  "subject": "string",
  "body": "Warm professional NZ tone. Explain the saving opportunity clearly. Include disclaimer that rates can change and this is not a guarantee. Clear call to action.",
  "call_to_action": "What to reply with",
  "urgency_level": "urgent|standard"
}`;
}

// ================================================================
// NEEDS & OBJECTIVES DRAFT
// ================================================================
export function buildNeedsObjectivesPrompt(ctx: any): string {
  return `${SYSTEM_BASE}

Draft a Needs & Objectives statement for a NZ mortgage application.
Required under Financial Markets Conduct Act 2013 and Financial Advisers Act 2008.

Application: ${ctx.application_type} for ${ctx.loan_purpose}
Loan: $${ctx.loan_amount?.toLocaleString()} | LVR: ${ctx.lvr_percent?.toFixed(0)}%
Income type: ${(ctx.income_types || []).join(', ')}
Self-employed: ${ctx.is_self_employed || false}

Return JSON:
{
  "primary_objective": "string",
  "secondary_objectives": ["list"],
  "needs_identified": ["list"],
  "why_this_loan_type": "string",
  "alternatives_considered": "string",
  "risk_acknowledgements": ["list"],
  "adviser_declaration": "Standard FMC Act declaration",
  "cccfa_affordability_note": "CCCFA affordability assessment statement"
}`;
}

// ================================================================
// ANOMALY EXPLANATION
// ================================================================
export function buildAnomalyExplainPrompt(anomaly: {
  title: string; description: string; severity: string;
}, ctx: any): string {
  return `${SYSTEM_BASE}

Explain this mortgage application anomaly in plain English for a NZ broker.
Anomaly: ${anomaly.title}
Detail: ${anomaly.description}
Severity: ${anomaly.severity}
Context: Loan $${ctx.loan_amount?.toLocaleString()}, DTI ${ctx.dti_ratio?.toFixed(1)}x, LVR ${ctx.lvr_percent?.toFixed(0)}%

Return JSON:
{
  "plain_english": "What this means — 2 sentences",
  "lender_impact": "How this affects assessment",
  "suggested_fix": "Specific action to resolve",
  "cccfa_relevance": "CCCFA/FMA compliance implications if any",
  "urgency": "Must fix before submission|Address if possible|Minor concern",
  "broker_script": "What to say to the client about this"
}`;
}

// ================================================================
// CLIENT PORTAL AI ASSISTANT
// Friendly, plain English — not broker jargon
// ================================================================
export function buildClientAssistantPrompt(
  clientFirstName: string,
  applicationStage: string,
  readinessGrade: string | null,
  missingDocs: string[]
): string {
  return `You are a friendly mortgage application assistant helping ${clientFirstName} understand their application.
Speak in plain English — no jargon. Be warm, reassuring, and helpful.
Application stage: ${applicationStage}
Readiness: ${readinessGrade || 'not yet assessed'}
Missing documents: ${missingDocs.join(', ') || 'none'}
Keep responses short (2-3 sentences max). If asked legal or rate questions, say their adviser can help.
Never make guarantees about approval.`;
}

// ================================================================
// VOICE TRANSCRIPT EXTRACTION
// Extracts structured data from meeting transcripts
// ================================================================
export function buildTranscriptExtractionPrompt(): string {
  return `${SYSTEM_BASE}

Extract structured mortgage application data from this adviser-client meeting transcript.
Return ONLY data that was explicitly stated — do not infer or guess.
Mark uncertain fields with confidence "low".

Return JSON:
{
  "client": {
    "first_name": null,
    "last_name": null,
    "email": null,
    "phone": null,
    "date_of_birth": null,
    "marital_status": null,
    "dependants": null,
    "confidence": "high|medium|low"
  },
  "income": [
    {
      "description": null,
      "amount": null,
      "frequency": null,
      "income_type": null,
      "confidence": "high|medium|low"
    }
  ],
  "expenses": {
    "rent_board": null,
    "food_groceries": null,
    "transport": null,
    "utilities": null,
    "insurance": null,
    "other": null,
    "confidence": "high|medium|low"
  },
  "loan_details": {
    "purpose": null,
    "amount": null,
    "property_address": null,
    "property_value": null,
    "purchase_price": null,
    "deposit_amount": null,
    "deposit_source": null,
    "confidence": "high|medium|low"
  },
  "needs_objectives": {
    "primary_goal": null,
    "timeline": null,
    "rate_preference": null,
    "risk_tolerance": null,
    "confidence": "high|medium|low"
  },
  "flags_for_review": ["anything unclear or requiring adviser verification"],
  "extraction_confidence": "high|medium|low"
}`;
}
