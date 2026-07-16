"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
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
  const router = useRouter();
  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/dashboard/reports"));
  const [profileOpen, setProfileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setUserEmail(user?.email ?? null);
      setIsAdmin(user?.id === ADMIN_USER_ID);
      if (user) {
        supabase
          .from("affiliates")
          .select("avatar_url, display_name")
          .eq("user_id", user.id)
          .single()
          .then(({ data: aff }) => {
            setAvatarUrl(aff?.avatar_url ?? null);
            setDisplayName(aff?.display_name ?? null);
          });
      }
    });
  }, []);

  // El perfil (nombre/foto) puede cambiar en Configuración de Cuenta: nos
  // actualizamos al instante sin recargar toda la app.
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.display_name !== undefined) setDisplayName(d.display_name);
      if (d.avatar_url !== undefined) setAvatarUrl(d.avatar_url);
    };
    window.addEventListener("profile-updated", onUpdate);
    return () => window.removeEventListener("profile-updated", onUpdate);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? "bg-white/10 text-white"
        : "text-slate-300 hover:bg-white/10"
        }`;
    return (
    <aside
      className={`fixed md:static top-0 left-0 h-full w-64 shrink-0 border-r border-white/10 bg-black/95 backdrop-blur py-6 px-3 z-50 flex flex-col transform transition-transform duration-200 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
        <Link href="/dashboard" className="px-4 mb-6 cursor-pointer block" onClick={onClose}>
          <Image src="/logo.png" alt="A&S Afiliados" width={150} height={74} priority />
        </Link>

      <nav className="flex flex-col gap-1">
        <Link href="/dashboard" className={linkClass("/dashboard")} onClick={onClose}>
          <LayoutDashboard size={18} />
          Panel
        </Link>

        <button
          onClick={() => setReportsOpen(!reportsOpen)}
          className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg text-sm font-medium
          text-slate-300 hover:bg-white/10"
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
        )}<Link href="/dashboard/payments" className={linkClass("/dashboard/payments")} onClick={onClose}>
          <CreditCard size={18} />
          Pagos
        </Link>

        {!isAdmin && (
          <Link href="/dashboard/sub-affiliates" className={linkClass("/dashboard/sub-affiliates")} onClick={onClose}>
            <Users size={18} />
            Subafiliados
          </Link>
        )}

        <Link href="/dashboard/commission-plan" className={linkClass("/dashboard/commission-plan")} onClick={onClose}>
          <BookOpen size={18} />
          Plan de Comisión
        </Link>

        {isAdmin && (
          <Link href="/admin" className={linkClass("/admin")} onClick={onClose}>
            <Shield size={18} />
            Admin
          </Link>
        )}
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
                <Image src={avatarUrl} alt="Foto de perfil" fill className="object-cover" />
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