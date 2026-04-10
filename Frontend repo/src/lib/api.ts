import { supabase } from './supabase'
import {
  parseResultJson,
  waitForProcessingJob,
  type ProcessingJobRow,
} from './processingJobs'

export type { ProcessingJobRow } from './processingJobs'

/** Coerces edge function JSON to a plain object record. */
function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

/**
 * Invokes `parse-bank-statement` with async job mode (`async: true`).
 * When `wait` is true (default), subscribes to `processing_jobs` until complete and returns `result_json`.
 */
export async function invokeParseBankStatement(
  body: Record<string, unknown>,
  options?: {
    /** When false, returns immediately after `job_id` is received (fire-and-forget). Default true. */
    wait?: boolean
    onProgress?: (row: ProcessingJobRow) => void
  },
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const wait = options?.wait !== false
  const onProgress = options?.onProgress

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase.functions.invoke('parse-bank-statement', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { ...body, async: true },
    })

    if (error) return { data: null, error: error.message }

    const rec = asRecord(data)
    if (!rec) return { data: null, error: 'No response from parser' }

    const jobId = typeof rec.job_id === 'string' ? rec.job_id : null
    if (jobId) {
      if (!wait) {
        return {
          data: {
            job_id: jobId,
            status: typeof rec.status === 'string' ? rec.status : 'queued',
          },
          error: null,
        }
      }
      try {
        const finalRow = await waitForProcessingJob(supabase, jobId, onProgress)
        const parsed = parseResultJson(finalRow)
        if (!parsed) {
          return { data: null, error: 'Parse completed with no result data' }
        }
        if (parsed.success === true || parsed.ok === true) {
          return { data: parsed, error: null }
        }
        if (typeof parsed.error === 'string' && parsed.error) {
          return { data: parsed, error: parsed.error }
        }
        return { data: parsed, error: 'Parse did not succeed' }
      } catch (e: unknown) {
        return { data: null, error: e instanceof Error ? e.message : String(e) }
      }
    }

    if (rec.success === true || rec.ok === true) {
      return { data: rec, error: null }
    }
    if (typeof rec.error === 'string' && rec.error) {
      return { data: rec, error: rec.error }
    }
    return { data: rec, error: null }
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function invokeFunction<T = any>(
  name: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase.functions.invoke(name, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body,
    })

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}
