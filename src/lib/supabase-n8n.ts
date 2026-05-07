import { createBrowserClient } from '@supabase/ssr'

// Read-only client for n8n's Supabase (Clinica-Odonto)
export const createN8nClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_N8N_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_N8N_SUPABASE_KEY!
  )
