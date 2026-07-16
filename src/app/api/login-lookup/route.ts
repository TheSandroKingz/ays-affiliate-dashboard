import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!rateLimit(`login-lookup:${ip}`, 40, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos.' },
      { status: 429 }
    )
  }

  const { identifier } = await request.json()

  if (!identifier) {
    return NextResponse.json({ error: 'Falta el usuario o correo' }, { status: 400 })
  }

  const { data: affiliate, error: findError } = await supabaseAdmin
    .from('affiliates')
    .select('user_id')
    .ilike('display_name', identifier.replace(/[%_]/g, '\\$&'))
    .maybeSingle()

  if (findError || !affiliate) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(affiliate.user_id)

  if (userError || !userData?.user?.email) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ email: userData.user.email })
}
