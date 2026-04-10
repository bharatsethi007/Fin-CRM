/** Represents one row from `soa_agent_steps` (output_json + citations jsonb). */
export type AgentStepRow = {
  id: string;
  soa_id: string;
  step_number: number;
  step_name: string;
  title: string | null;
  status: 'pending' | 'running' | 'done' | 'error';
  input_summary: string | null;
  output_json: Record<string, unknown> | null;
  citations: unknown[] | null;
  is_baseline: boolean | null;
  started_at: string | null;
  completed_at: string | null;
  /** Present when status is `error` (optional if column not migrated). */
  error_message?: string | null;
};

/** Stores one sentence row used for adviser override dropdowns. */
export type SentenceRow = {
  id: string;
  sentence_key: string;
  category: 'reason' | 'risk' | 'structure';
  sentence: string;
  is_active: boolean;
};

/** Subset of `soas` columns used by the SOA generate popup and evidence panel. */
export type SOAPreviewRow = {
  id: string;
  application_id: string;
  firm_id: string;
  version?: number | null;
  status: string | null;
  recommended_lender_id?: string | null;
  adviser_lender_name: string | null;
  adviser_reason_keys: string[] | null;
  adviser_risk_keys: string[] | null;
  adviser_structure_key: string | null;
  assembled_reason_text: string | null;
  assembled_risk_text: string | null;
  assembled_structure_text: string | null;
  layer_client_situation: Record<string, unknown> | null;
  layer_regulatory_gate: Record<string, unknown> | null;
  layer_market_scan: Record<string, unknown> | null;
  layer_quant_matrix: Record<string, unknown> | null;
  layer_recommendation: Record<string, unknown> | null;
  layer_sensitivity: Record<string, unknown> | null;
  layer_risks: Record<string, unknown> | null;
  layer_commission: Record<string, unknown> | null;
  is_baseline: boolean | null;
  baseline_warnings: string[] | null;
  total_tokens_used: number | null;
  agent_completed_at: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  adviser_notes?: string | null;
  created_at?: string;
  updated_at?: string;
};
