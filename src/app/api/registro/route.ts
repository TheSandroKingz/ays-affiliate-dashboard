import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Enlace de promoción por defecto para nuevas cuentas.
// Cuentas concretas (p. ej. Jeffer) se personalizan a mano en la BD.
const DEFAULT_PROMO_LINK = 'https://go.affision.com/visit/?bta=44878&nci=5520'

export async function POST(request: NextRequest) {
  // Exigir la sesión del usuario recién creado y tomar su id del token,
  // en vez de confiar en un userId enviado por el cliente.
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { displayName, referredBy } = await request.json()

  const { error } = await supabaseAdmin.from('affiliates').insert({
    user_id: authData.user.id,
    display_name: displayName,
    referred_by: referredBy || null,
    promo_link: DEFAULT_PROMO_LINK,
    subaffiliate_percent: 5,
    accepted_terms: true,
    accepted_privacy: true,
  })

  if (error) {
    const message = error.code === "23505"
      ? "Ese nombre de usuario ya está en uso, elige otro."
      : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}