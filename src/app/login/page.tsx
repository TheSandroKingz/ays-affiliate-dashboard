'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let loginEmail = email

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
  loginEmail = body.email
}

const { error: signInError } = await supabase.auth.signInWithPassword({
  email: loginEmail,
  password,
})

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }
  return (
    <main className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="flex items-end justify-center leading-none">
            <span className="text-white font-black text-7xl">A</span>
            <span className="relative text-emerald-400 font-black text-7xl mx-1">
              &
              <svg viewBox="0 0 24 24" className="absolute left-1/2 -translate-x-1/2 -top-3 w-7 h-7 fill-black">
                <path d="M12 2C12 2 4 9 4 14a4 4 0 0 0 7 2.65C10.44 19.32 9 21 6 21h12c-3 0-4.44-1.68-5-4.35A4 4 0 0 0 20 14c0-5-8-12-8-12z"/>
              </svg>
            </span>
            <span className="text-white font-black text-7xl">S</span>
          </div>
          <div className="text-emerald-400 font-bold tracking-[0.4em] text-lg mt-2">AFILIADOS</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg border border-emerald-400/50 rounded-2xl p-8 shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
          <h1 className="text-2xl font-semibold text-white text-center mb-6">Iniciar sesión</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 pl-10 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
            </div>

          <p className="text-right text-sm -mt-2">
            <a href="/recuperar" className="text-emerald-400 hover:text-emerald-300 font-medium">
              ¿Olvidaste tu contraseña?
            </a>
          </p>

          {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 transition-opacity"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-slate-300 text-sm mt-6">
            ¿No tienes cuenta?{' '}
            <a href="/registro" className="text-emerald-400 hover:text-emerald-300 font-medium">
              Regístrate
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
