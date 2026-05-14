import { createClient } from '@supabase/supabase-js'

const N8N_URL = process.env.NEXT_PUBLIC_N8N_SUPABASE_URL ?? 'https://kqwijexdskiilhfxkbvk.supabase.co'
const N8N_KEY = process.env.NEXT_PUBLIC_N8N_SUPABASE_KEY ?? 'sb_publishable_gYQ12En3DdbmRv7X9v9CnA_MJuN2cMT'

// Singleton criado no nível do módulo — garante que sempre aponta para o banco n8n
export const n8nClient = createClient(N8N_URL, N8N_KEY)

// Mantém compatibilidade com chamadas existentes
export const createN8nClient = () => n8nClient
