import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { enviarPush } from '@/lib/push'
import { ADMIN_USER_ID } from '@/lib/adminAuth'
import { contieneEmoji } from '@/lib/texto'

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

  // Sin emojis en el nombre.
  if (contieneEmoji(nombre)) {
    return NextResponse.json(
      { error: 'El nombre de usuario no puede tener emojis.' },
      { status: 400 }
    )
  }

  // Fecha de nacimiento (opcional pero validada): formato correcto y 18+.
  let birthdate: string | null = null
  if (body.birthdate) {
    const raw = String(body.birthdate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return NextResponse.json({ error: 'Fecha de nacimiento no válida.' }, { status: 400 })
    }
    const nac = new Date(raw + 'T00:00:00')
    const hoy = new Date()
    let edad = hoy.getFullYear() - nac.getFullYear()
    const m = hoy.getMonth() - nac.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
    if (Number.isNaN(nac.getTime()) || edad < 18 || edad > 120) {
      return NextResponse.json(
        { error: 'Debes ser mayor de edad (18+) para registrarte.' },
        { status: 400 }
      )
    }
    birthdate = raw
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

  const fila: Record<string, unknown> = {
    user_id: authData.user.id,
    display_name: nombre,
    referred_by: referredById,
    promo_link: DEFAULT_PROMO_LINK,
    subaffiliate_percent: 5,
    approved: false, // toda cuenta nueva nace pendiente hasta que el admin la acepta
    accepted_terms: true,
    accepted_privacy: true,
  }
  if (birthdate) fila.birthdate = birthdate

  let { error } = await supabaseAdmin.from('affiliates').insert(fila)
  // Por si la columna 'birthdate' aún no existe: reintenta sin ella (no bloquea).
  if (error && birthdate) {
    delete fila.birthdate
    const r = await supabaseAdmin.from('affiliates').insert(fila)
    error = r.error
  }

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

  // Avisa al admin (a su móvil) de la nueva solicitud pendiente de aprobar.
  after(() =>
    enviarPush(ADMIN_USER_ID, {
      title: "Nueva solicitud 🙋",
      body: `${nombre} quiere unirse. Revísala para aprobarla.`,
      url: "/admin/solicitudes",
    })
  )

  return NextResponse.json({ ok: true })
}