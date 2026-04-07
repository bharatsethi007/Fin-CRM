import { createClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Missing Supabase env vars:', { supabaseUrl, supabaseAnonKey });
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
