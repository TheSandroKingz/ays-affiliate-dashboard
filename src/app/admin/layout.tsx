import Link from "next/link";
import Image from "next/image";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur border-b border-white/10 px-4 sm:px-6 py-3 flex items-center gap-4 sm:gap-6">
        <Link href="/dashboard">
          <Image
            src="/logo.png"
            alt="A&S Afiliados"
            width={90}
            height={44}
            priority
            className="max-w-full h-auto"
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/admin" className="text-slate-300 hover:text-white transition-colors">
            Estadísticas
          </Link>
          <Link
            href="/admin/comisiones"
            className="text-slate-300 hover:text-white transition-colors"
          >
            Comisiones
          </Link>
          <Link
            href="/admin/solicitudes"
            className="text-slate-300 hover:text-white transition-colors"
          >
            Solicitudes
          </Link>
        </nav>
        <Link
          href="/dashboard"
          className="ml-auto text-sm font-medium text-emerald-400 hover:text-emerald-300"
        >
          Volver al panel
        </Link>
      </header>
      <main className="p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
