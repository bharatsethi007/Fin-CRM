import { invokeFunction } from '../src/lib/api';

export type GeminiContents = Array<{
  role?: string;
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}>;

/**
 * Calls Gemini REST API via Edge Function `gemini-proxy` — no API key in the browser bundle.
 */
export async function invokeGeminiProxy(body: {
  model: string;
  contents: GeminiContents;
  generationConfig?: Record<string, unknown>;
  tools?: unknown;
  toolConfig?: unknown;
}): Promise<{ text: string; raw: unknown }> {
  const { data, error } = await invokeFunction<Record<string, unknown>>('gemini-proxy', body);

  if (error) throw new Error(error || 'gemini-proxy invoke failed');

  const d = data as Record<string, unknown> | null;
  if (!d) throw new Error('Invalid gemini-proxy response');

  if (d.error) {
    const msg = typeof d.error === 'object' && d.error !== null && 'message' in d.error
      ? String((d.error as { message?: string }).message)
      : JSON.stringify(d.error);
    throw new Error(msg);
  }

  const candidates = d.candidates as Array<{
    content?: { parts?: Array<{ text?: string }> };
  }> | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { text, raw: data };
}
