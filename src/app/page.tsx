export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 px-4">
      <div className="max-w-md w-full text-center text-white">
        <h1 className="text-6xl font-extrabold mb-4 tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-white bg-clip-text text-transparent">AYS Affiliados</h1>
        <p className="text-slate-300 mb-8">
          Bienvenido al panel de afiliados. Gestiona tus estadísticas y comisiones en un solo lugar.
        </p>
        <div className="flex gap-3 justify-center">
          <a href="/login" className="px-6 py-3 rounded-lg bg-white text-slate-900 font-medium hover:bg-slate-100 transition">
            Iniciar sesión
          </a>
          <a href="/registro" className="px-6 py-3 rounded-lg border border-white/30 text-white font-medium hover:bg-white/10 transition">
            Crear cuenta
          </a>
        </div>
      </div>
    </main>
  )
}