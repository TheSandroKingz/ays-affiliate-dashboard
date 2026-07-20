import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

// Enlace de promoción por defecto para nuevas cuentas.
// Cuentas concretas (p. ej. Jeffer) se personalizan a mano en la BD.
const DEFAULT_PROMO_LINK = 'https://go.affision.com/visit/?bta=44878&nci=5520'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!rateLimit(`registro:${ip}`, 25, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos.' },
      { status: 429 }
    )
  }

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

  const body = await request.json().catch(() => ({}))
  const nombre = String(body.displayName ?? '').trim()

  // El nombre de usuario es obligatorio y con un largo razonable.
  if (nombre.length < 2 || nombre.length > 40) {
    return NextResponse.json(
      { error: 'El nombre de usuario debe tener entre 2 y 40 caracteres.' },
      { status: 400 }
    )
  }

  // Validamos que, si viene un "referido por", sea un afiliado real.
  let referredById: string | null = null
  if (body.referredBy) {
    const { data: padre } = await supabaseAdmin
      .from('affiliates')
      .select('id')
      .eq('id', body.referredBy)
      .maybeSingle()
    referredById = padre?.id ?? null
  }

  const { error } = await supabaseAdmin.from('affiliates').insert({
    user_id: authData.user.id,
    display_name: nombre,
    referred_by: referredById,
    promo_link: DEFAULT_PROMO_LINK,
    subaffiliate_percent: 5,
    approved: false, // toda cuenta nueva nace pendiente hasta que el admin la acepta
    accepted_terms: true,
    accepted_privacy: true,
  })

  if (error) {
    // El perfil no se creó (lo más común: nombre de usuario duplicado).
    // Si el usuario NO tenía ya un perfil, deshacemos el usuario de Auth
    // recién creado para que no quede una cuenta "a medias" y pueda
    // reintentar. (El check evita borrar una cuenta ya establecida.)
    const { data: yaExiste } = await supabaseAdmin
      .from('affiliates')
      .select('user_id')
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (!yaExiste) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    }
    const message = error.code === "23505"
      ? "Ese nombre de usuario ya está en uso, elige otro."
      : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}