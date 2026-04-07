import { logger } from '../utils/logger';
// ================================================================
// AI CACHE SERVICE
// Read/write AI outputs to Supabase for caching and audit trail
// ================================================================

import { supabase } from './supabaseClient';

export interface AiOutputRecord {
  id: string;
  application_id: string;
  feature: string;
  output_json: any;
  output_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  model_used: string;
  cache_valid: boolean;
  created_at: string;
  context_hash: string;
}

// Generate a simple hash of the context to detect stale cache
export function hashContext(context: object): string {
  const str = JSON.stringify(context);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Check for a valid cached output
export async function getCached(
  applicationId: string,
  feature: string,
  contextHash?: string
): Promise<AiOutputRecord | null> {
  const { data } = await supabase
    .from('ai_outputs')
    .select('*')
    .eq('application_id', applicationId)
    .eq('feature', feature)
    .eq('cache_valid', true)
    .gt('cache_expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  // If context hash provided, validate it matches
  if (contextHash && data.context_hash !== contextHash) return null;
  return data as AiOutputRecord;
}

// Save a new AI output to the database
export async function saveOutput(params: {
  applicationId: string;
  firmId: string;
  advisorId?: string;
  clientId?: string;
  feature: string;
  contextHash: string;
  outputJson?: any;
  outputText?: string;
  promptTokens: number;
  completionTokens: number;
  modelUsed?: string;
  triggeredBy?: string;
  durationMs?: number;
  cacheHours?: number;
}): Promise<string | null> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (params.cacheHours || 24));

  const { data, error } = await supabase
    .from('ai_outputs')
    .insert({
      application_id: params.applicationId,
      firm_id: params.firmId,
      advisor_id: params.advisorId || null,
      client_id: params.clientId || null,
      feature: params.feature,
      context_hash: params.contextHash,
      output_json: params.outputJson || null,
      output_text: params.outputText || null,
      prompt_tokens: params.promptTokens,
      completion_tokens: params.completionTokens,
      model_used: params.modelUsed || 'gpt-4o-mini',
      triggered_by: params.triggeredBy || 'advisor',
      duration_ms: params.durationMs || null,
      cache_valid: true,
      cache_expires_at: expiresAt.toISOString(),
      pii_stripped: true,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('AI cache save error:', error);
    return null;
  }
  return data?.id || null;
}

// Invalidate cache for a feature when application data changes
export async function invalidateCache(
  applicationId: string,
  features?: string[]
): Promise<void> {
  let query = supabase
    .from('ai_outputs')
    .update({ cache_valid: false })
    .eq('application_id', applicationId);

  if (features && features.length > 0) {
    query = query.in('feature', features);
  }

  await query;
}

// Get all AI outputs for an application (audit trail view)
export async function getAuditTrail(applicationId: string): Promise<AiOutputRecord[]> {
  const { data } = await supabase
    .from('ai_outputs')
    .select('id, feature, model_used, prompt_tokens, completion_tokens, created_at, adviser_reviewed, triggered_by')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  return (data || []) as AiOutputRecord[];
}

// Check if firm has tokens available
export async function checkTokenLimit(firmId: string): Promise<{
  allowed: boolean;
  tokensUsed: number;
  tokensLimit: number;
  percentUsed: number;
}> {
  const { data } = await supabase
    .rpc('check_ai_token_limit', { p_firm_id: firmId });

  if (!data) return { allowed: true, tokensUsed: 0, tokensLimit: 500000, percentUsed: 0 };
  return {
    allowed: data.allowed,
    tokensUsed: data.tokens_used,
    tokensLimit: data.tokens_limit,
    percentUsed: data.percent_used,
  };
}
