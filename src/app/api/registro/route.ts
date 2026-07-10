import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  const { userId, displayName, referredBy } = await request.json()

  const { error } = await supabaseAdmin.from('affiliates').insert({
    user_id: userId,
    display_name: displayName,
    referred_by: referredBy || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}