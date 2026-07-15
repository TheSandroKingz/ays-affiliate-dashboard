import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Enlace de promoción por defecto para nuevas cuentas.
// Cuentas concretas (p. ej. Jeffer) se personalizan a mano en la BD.
const DEFAULT_PROMO_LINK = 'https://go.affision.com/visit/?bta=44878&nci=5520'

export async function POST(request: NextRequest) {
  const { userId, displayName, referredBy } = await request.json()

  const { error } = await supabaseAdmin.from('affiliates').insert({
    user_id: userId,
    display_name: displayName,
    referred_by: referredBy || null,
    promo_link: DEFAULT_PROMO_LINK,
    subaffiliate_percent: 5,
  })

  if (error) {
    const message = error.code === "23505"
      ? "Ese nombre de usuario ya esta en uso, elige otro."
      : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}