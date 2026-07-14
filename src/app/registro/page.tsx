'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function RegistroPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ref, setRef] = useState<string | null>(null)
  const [referrerName, setReferrerName] = useState<string | null>(null)

  useEffect(() => {
    const refParam = new URLSearchParams(window.location.search).get('ref')
    if (refParam) {
      setRef(refParam)
      fetch('/api/referrer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: refParam }),
      })
        .then((res) => res.json())
        .then((body) => setReferrerName(body.displayName ?? null))
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      setError(authError?.message ?? 'Error al crear la cuenta')
      setLoading(false)
      return
    }

    const res = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authData.user.id,
        displayName: nombre,
        referredBy: ref,
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Error al crear tu perfil')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-white text-center mb-1">Crea tu cuenta</h1>
        <p className="text-slate-300 text-center mb-8">Únete al programa de afiliados</p>

        {referrerName && (
          <div className="mb-4 rounded-lg bg-white/10 border border-white/20 px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Invitado por</p>
            <p className="text-white font-medium">{referrerName}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 transition-opacity"
          >
            {loading ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-slate-300 text-sm mt-6">
          ¿Ya tienes cuenta?{' '}
          <a href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">
            Inicia sesión
          </a>
        </p>
      </div>
    </main>
  )
}
