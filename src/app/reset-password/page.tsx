'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { traducirError } from '@/lib/authErrors'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(traducirError(updateError.message))
      return
    }

    setDone(true)
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <main className="min-h-screen flex items-start md:items-center justify-center bg-black px-4 pt-16 md:pt-0">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex justify-center">
          <Image src="/logo.png" alt="A&S Afiliados" width={240} height={118} className="rounded-xl max-w-full h-auto" priority />
        </div>

        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold text-white text-center mb-1">Nueva contraseña</h1>

          {done ? (
            <p className="text-slate-200 text-sm text-center mt-4">
              Contraseña actualizada. Redirigiendo al inicio de sesión...
            </p>
          ) : !ready ? (
            <p className="text-slate-300 text-sm text-center mt-4">
              Verificando enlace...
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Nueva contraseña</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Confirmar contraseña</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 transition-opacity"
              >
                {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
