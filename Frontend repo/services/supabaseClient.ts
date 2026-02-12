import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase credentials
const supabaseUrl = 'https://lfhaaqjinpbkozaoblyo.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaGFhcWppbnBia296YW9ibHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MzQ4OTYsImV4cCI6MjA3OTIxMDg5Nn0.tMcRPOc5kZMRN41u0ZzYinUxRa-dKJ3a93meqIaZE4U'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)