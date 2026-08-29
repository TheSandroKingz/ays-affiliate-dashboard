"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID, esCuentaPropia, esSoloBot } from "@/lib/adminId";
import InstallAppButton from "@/components/InstallAppButton";
import { useProfile } from "@/components/DashboardProvider";
import {
  LayoutDashboard,
  ClipboardList,
  CreditCard,
  Users,
  BookOpen,
  ChevronDown,
  Settings,
  LogOut,
  Shield,
  MessageCircle,
  PieChart,
  Wallet,
} from "lucide-react";

const reportLinks = [
  { name: "Informe de Medios", href: "/dashboard/reports/media" },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/dashboard/reports"));
  const [telegramOpen, setTelegramOpen] = useState(
    pathname.startsWith("/admin/telegram") ||
      pathname.startsWith("/admin/bots") ||
      pathname === "/dashboard/analisis"
  );
  const [adminOpen, setAdminOpen] = useState(
    pathname === "/admin" ||
      pathname.startsWith("/admin/comisiones") ||
      pathname.startsWith("/admin/actividad") ||
      pathname.startsWith("/admin/memoria") ||
      pathname.startsWith("/admin/solicitudes") ||
      pathname.startsWith("/admin/afiliado")
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [esPropia, setEsPropia] = useState(false);
  const [tieneBot, setTieneBot] = useState(false);
  const [soloBot, setSoloBot] = useState(false);
  // Nombre y foto vienen del almacén compartido (una sola carga para toda la app).
  const { displayName, avatarUrl } = useProfile();

  useEffect(() => {
    // getSession lee de localStorage (sin red): barato, solo para email/admin.
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setUserEmail(user?.email ?? null);
      setIsAdmin(user?.id === ADMIN_USER_ID);
      setEsPropia(esCuentaPropia(user?.id));
      setSoloBot(esSoloBot(user?.id));
      // ¿Este afiliado tiene un bot propio (Jeffer, Mariam)? Si sí, le mostramos
      // el apartado "Telegram" para ver los depósitos de su bot.
      const token = data.session?.access_token;
      if (user && user.id !== ADMIN_USER_ID && token) {
        // Un fallo transitorio de esta petición NO debe ocultar el apartado
        // "Telegram" del afiliado: reintentamos un par de veces antes de rendirnos
        // (si no, un 500/timeout puntual dejaría tieneBot=false toda la sesión).
        const cargarTieneBot = async (intentos = 3) => {
          for (let i = 0; i < intentos; i++) {
            try {
              const r = await fetch("/api/telegram/mi-bot", {
                headers: { Authorization: "Bearer " + token },
              });
              if (r.ok) {
                const b = await r.json();
                setTieneBot(!!b?.tieneBot);
                return;
              }
            } catch {
              /* reintenta */
            }
            await new Promise((res) => setTimeout(res, 1500));
          }
        };
        cargarTieneBot();
      }
    });
  }, []);

  async function handleLogout() {
    // Soltamos la suscripción push del navegador antes de cerrar sesión (evita que
    // los avisos del usuario anterior lleguen al siguiente). ⚠️ En móvil (PWA)
    // `navigator.serviceWorker.ready` puede COLGARSE para siempre, así que lo
    // corremos con timeout: la limpieza de push NUNCA debe bloquear el logout.
    try {
      const { desactivarPush } = await import("@/lib/pushClient");
      await Promise.race([
        desactivarPush(),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* si falla, seguimos con el logout igual */
    }
    // Cerrar sesión: intentamos revocar en el servidor (con timeout por si la red
    // móvil se cuelga) y SIEMPRE limpiamos la sesión local, para que el logout
    // funcione aunque la petición de red falle o tarde.
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch {
      /* da igual: limpiamos local abajo */
    }
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch {
      /* ignorar */
    }
    // Redirección DURA (recarga completa): así el guard de sesión no rehidrata la
    // sesión vieja y el móvil sale de verdad al login.
    window.location.href = "/login";
  }

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? "bg-white/10 text-white"
        : "text-slate-300 hover:bg-white/10"
        }`;
    return (
    <aside
      className={`fixed md:static top-0 left-0 min-h-screen md:h-auto md:self-stretch w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-black/95 backdrop-blur py-6 px-3 z-50 flex flex-col transform transition-transform duration-200 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
        <Link href="/dashboard" className="px-4 mb-6 cursor-pointer block" onClick={onClose}>
          <Image src="/logo-mark.png" alt="A&S Afiliados" width={45} height={56} />
        </Link>

      <nav className="flex flex-col gap-1">
        {soloBot && (
          <Link href="/dashboard/bot" className={linkClass("/dashboard/bot")} onClick={onClose}>
            <MessageCircle size={18} />
            Conversaciones del bot
          </Link>
        )}
        {soloBot && (
          <Link href="/dashboard/analisis" className={linkClass("/dashboard/analisis")} onClick={onClose}>
            <ClipboardList size={18} />
            Informe de análisis
          </Link>
        )}
        {!soloBot && (
        <Link href="/dashboard" className={linkClass("/dashboard")} onClick={onClose}>
          <LayoutDashboard size={18} />
          Panel
        </Link>
        )}

        {!isAdmin && !soloBot && (
          <>
            <button
              onClick={() => setReportsOpen(!reportsOpen)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm font-medium
              text-slate-300 hover:bg-white/10 w-full"
            >
              <span className="flex items-center gap-3">
                <ClipboardList size={18} />
                Informes
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform ${reportsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {reportsOpen && (
              <div className="ml-8 flex flex-col gap-1">
                {reportLinks.map((r) => (
                  <Link key={r.href} href={r.href} className={linkClass(r.href)} onClick={onClose}>
                    {r.name}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        {!isAdmin && !esPropia && !soloBot && (
          <Link href="/dashboard/payments" className={linkClass("/dashboard/payments")} onClick={onClose}>
            <CreditCard size={18} />
            Pagos
          </Link>
        )}

        {!isAdmin && !esPropia && !soloBot && (
          <Link href="/dashboard/sub-affiliates" className={linkClass("/dashboard/sub-affiliates")} onClick={onClose}>
            <Users size={18} />
            Subafiliados
          </Link>
        )}

        {!soloBot && (
        <Link href="/dashboard/commission-plan" className={linkClass("/dashboard/commission-plan")} onClick={onClose}>
          <BookOpen size={18} />
          Plan de Comisión
        </Link>
        )}

        {!isAdmin && tieneBot && !soloBot && (
          <Link href="/dashboard/telegram" className={linkClass("/dashboard/telegram")} onClick={onClose}>
            <MessageCircle size={18} />
            Telegram
          </Link>
        )}

        {isAdmin && (
          <>
            <button
              onClick={() => setTelegramOpen(!telegramOpen)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm font-medium
              text-slate-300 hover:bg-white/10 w-full"
            >
              <span className="flex items-center gap-3">
                <MessageCircle size={18} />
                Telegram
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform ${telegramOpen ? "rotate-180" : ""}`}
              />
            </button>
            {telegramOpen && (
              <div className="ml-8 flex flex-col gap-1">
                <Link href="/admin/telegram" className={linkClass("/admin/telegram")} onClick={onClose}>
                  Conversaciones
                </Link>
                <Link href="/admin/bots" className={linkClass("/admin/bots")} onClick={onClose}>
                  Bots
                </Link>
                <Link href="/dashboard/analisis" className={linkClass("/dashboard/analisis")} onClick={onClose}>
                  Informe de análisis
                </Link>
              </div>
            )}
          </>
        )}

        {isAdmin && (
          <Link href="/admin/reparto" className={linkClass("/admin/reparto")} onClick={onClose}>
            <PieChart size={18} />
            Reparto
          </Link>
        )}

        {isAdmin && (
          <Link href="/admin/gastos" className={linkClass("/admin/gastos")} onClick={onClose}>
            <Wallet size={18} />
            Gastos
          </Link>
        )}

        {/* Admin: desplegable con el resto de secciones (como Telegram). */}
        {isAdmin && (
          <>
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm font-medium
              text-slate-300 hover:bg-white/10 w-full"
            >
              <span className="flex items-center gap-3">
                <Shield size={18} />
                Admin
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform ${adminOpen ? "rotate-180" : ""}`}
              />
            </button>
            {adminOpen && (
              <div className="ml-8 flex flex-col gap-1">
                <Link href="/admin" className={linkClass("/admin")} onClick={onClose}>
                  Estadísticas
                </Link>
                <Link href="/admin/comisiones" className={linkClass("/admin/comisiones")} onClick={onClose}>
                  Comisiones
                </Link>
                <Link href="/admin/actividad" className={linkClass("/admin/actividad")} onClick={onClose}>
                  Actividad
                </Link>
                <Link href="/admin/memoria" className={linkClass("/admin/memoria")} onClick={onClose}>
                  Memoria
                </Link>
                <Link href="/admin/solicitudes" className={linkClass("/admin/solicitudes")} onClick={onClose}>
                  Solicitudes
                </Link>
              </div>
            )}
          </>
        )}

        <InstallAppButton onNavigate={onClose} />
      </nav>
      <div className="mt-auto relative border-t border-white/10 pt-3 px-1">
        {profileOpen && (
          <div className="absolute bottom-full left-1 mb-2 w-56 bg-black border border-white/10 rounded-lg shadow-lg py-1">
            <Link
              href="/dashboard/account"
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
              onClick={() => {
                setProfileOpen(false);
                onClose();
              }}
            >
              <Settings size={16} />
              Configuración de Cuenta
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-white/10"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        )}

        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex
          items-center justify-center text-sm font-semibold shrink-0 overflow-hidden relative">
            {avatarUrl ? (
                <Image src={avatarUrl} alt="Foto de perfil" fill sizes="32px" className="object-cover" />
              ) : userEmail ? (
                userEmail[0].toUpperCase()
              ) : (
                "?"
              )}
          </div>
          <span className="text-sm text-emerald-400 truncate">{displayName ?? userEmail ?? "Cargando..."}</span>
        </button>
      </div>
    </aside>
  );
}