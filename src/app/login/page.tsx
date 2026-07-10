'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-white bg-clip-text text-transparent">
            A & S Afiliados
          </span>
        </div>

        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold text-white text-center mb-1">Iniciar sesión</h1>
          <p className="text-slate-300 text-center text-sm mb-8">Accede a tu panel de afiliados</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Correo electrónico</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 transition-opacity"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-slate-300 text-sm mt-6">
            ¿No tienes cuenta?{' '}
            <a href="/registro" className="text-blue-400 hover:text-blue-300 font-medium">
              Regístrate
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
