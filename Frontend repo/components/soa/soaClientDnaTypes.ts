/** Shape of `soa_client_dna.analysis` JSON used by the SOA workspace UI. */
export type SoaClientDnaLeverageMetrics = {
  lvr_percent?: number;
  dti_ratio?: number;
  lti_ratio?: number;
  debt_to_assets?: number;
  umi_current?: number;
  umi_plus2?: number;
  umi_plus3?: number;
  cash_post_settlement?: number;
  concentration_percent?: number;
};

export type SoaLenderExclusion = { lender?: string; reason?: string };

export type SoaClientDnaView = {
  risk_tier?: string;
  income_stability_score?: number;
  underwriting_summary?: string;
  key_risks_top5?: string[];
  property_risks?: string[];
  leverage_risks?: string[];
  strengths?: string[];
  leverage_metrics?: SoaClientDnaLeverageMetrics;
  lender_exclusions?: SoaLenderExclusion[];
  [key: string]: unknown;
};
