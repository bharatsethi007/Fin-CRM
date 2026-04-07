import { invokeFunction } from '../src/lib/api';

export interface OpenAIProxyMeta {
  feature: string;
  applicationId?: string;
  firmId?: string;
  forceRefresh?: boolean;
}

/**
 * Calls OpenAI via Supabase Edge Function `ai-proxy` — never sends API keys to the browser.
 */
export async function invokeOpenAIProxy(
  openaiPayload: Record<string, unknown>,
  meta: OpenAIProxyMeta,
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
  raw: unknown;
}> {
  const { data, error } = await invokeFunction<Record<string, unknown>>('ai-proxy', {
    openaiPayload,
    feature: meta.feature,
    applicationId: meta.applicationId ?? null,
    firmId: meta.firmId ?? null,
    forceRefresh: meta.forceRefresh ?? false,
  });

  if (error) throw new Error(error || 'ai-proxy invoke failed');

  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') throw new Error('Invalid ai-proxy response');

  if (d.error) {
    const err = d.error as { message?: string } | string;
    const msg = typeof err === 'object' && err && 'message' in err ? String(err.message) : JSON.stringify(err);
    throw new Error(msg);
  }

  const choices = d.choices as Array<{ message?: { content?: string } }> | undefined;
  const usage = d.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const content = choices?.[0]?.message?.content ?? '';
  return {
    content: typeof content === 'string' ? content : '',
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    raw: data,
  };
}
