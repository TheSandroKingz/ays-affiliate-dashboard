import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Máximo que dura una sesión antes de pedir la contraseña de nuevo (seguridad).
// 30 días: no cierra sesión cada dos por tres, pero sigue re-autenticando de vez
// en cuando. NO limita cuántas personas/dispositivos pueden estar dentro a la vez
// (Supabase permite varias sesiones por usuario; el contador es por dispositivo).
export const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Guarda la sesión y la renueva sola: NO cierra sesión al pasar 1 hora.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
