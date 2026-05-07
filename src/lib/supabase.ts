import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente direto para uso em componentes cliente
export const supabase = createSupabaseClient(url, key)

// Cliente SSR (para uso futuro com server components)
export const createClient = () => createBrowserClient(url, key)
