import { supabase } from './supabase'

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
