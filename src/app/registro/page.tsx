'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import { traducirError } from '@/lib/authErrors'

export default function RegistroPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      setError(traducirError(authError?.message))
      setLoading(false)
      return
    }

    const res = await fetch('/api/registro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (authData.session?.access_token ?? ''),
      },
      body: JSON.stringify({
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
    <main className="min-h-screen flex items-start md:items-center justify-center bg-black px-4 pt-16 md:pt-0">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex justify-center">
          <Image src="/logo.png" alt="A&S Afiliados" width={240} height={118} className="rounded-xl max-w-full h-auto" priority />
        </div>
        <div className="bg-white/10 backdrop-blur-lg border border-emerald-400/50 rounded-2xl p-8 shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
        <h1 className="text-2xl font-semibold text-white text-center mb-1">Crea tu cuenta</h1>
        <p className="text-slate-300 text-center mb-8">Únete al programa de afiliados</p>

        {referrerName && (
          <div className="mb-4 rounded-lg bg-white/10 border border-white/20 px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Invitado por</p>
            <p className="text-white font-medium">{referrerName}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Nombre de usuario</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Con el que iniciarás sesión"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Contraseña</label>
            <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Mínimo 6 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <p className="text-xs text-slate-400 text-center">
            Al crear tu cuenta, aceptas los{' '}
            <a href="/terminos" target="_blank" className="text-emerald-400 hover:text-emerald-300">Términos</a>
            {' '}y la{' '}
            <a href="/privacidad" target="_blank" className="text-emerald-400 hover:text-emerald-300">Política de Privacidad</a>.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 transition-opacity"
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
      </div>
    </main>
  )
}
