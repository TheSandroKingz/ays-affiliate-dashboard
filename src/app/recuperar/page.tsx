'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { traducirError } from '@/lib/authErrors'

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let resetEmail = email

    if (!email.includes('@')) {
      const res = await fetch('/api/login-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email }),
      })
      const body = await res.json()
      if (!res.ok || !body.email) {
        setError(body.error || 'Usuario no encontrado')
        setLoading(false)
        return
      }
      resetEmail = body.email
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(traducirError(resetError.message))
      return
    }

    setSent(true)
  }

  return (
    <main className="min-h-screen flex items-start md:items-center justify-center bg-black px-4 pt-16 md:pt-0">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex justify-center">
          <Image src="/logo.png" alt="A&S Afiliados" width={240} height={118} className="rounded-xl max-w-full h-auto" priority />
        </div>

        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold text-white text-center mb-1">Recuperar contraseña</h1>

          {sent ? (
            <p className="text-slate-200 text-sm text-center mt-4">
              Si el usuario o correo existe, te hemos enviado un enlace para restablecer tu contraseña.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Usuario o correo electrónico</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="usuario o tu@email.com"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 transition-opacity"
              >
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
          )}

          <p className="text-center text-slate-300 text-sm mt-6">
            <a href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">
              Volver a iniciar sesión
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
