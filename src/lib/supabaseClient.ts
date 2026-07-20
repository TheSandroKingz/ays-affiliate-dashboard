import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Máximo que dura una sesión antes de pedir la contraseña de nuevo (seguridad).
export const MAX_SESSION_MS = 3 * 24 * 60 * 60 * 1000 // 3 días

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Guarda la sesión y la renueva sola: NO cierra sesión al pasar 1 hora.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
