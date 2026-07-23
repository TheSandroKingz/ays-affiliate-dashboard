"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { CardsSkeleton } from "@/components/Skeletons";
import { traducirError } from "@/lib/authErrors";
import { Eye, EyeOff } from "lucide-react";
import AvatarCropper from "@/components/AvatarCropper";
import PushToggle from "@/components/PushToggle";
import { useProfile } from "@/components/DashboardProvider";
import { TONOS, getTono, setTono, reproducirSonido, type TonoNotif } from "@/lib/sonido";
import { contieneEmoji } from "@/lib/texto";

export default function AccountPage() {
  const { birthdate: perfilBirthdate } = useProfile();
  const [activeTab, setActiveTab] = useState<
    "personal" | "cobro" | "seguridad" | "privacidad"
  >("personal");
  const [notifFtd, setNotifFtd] = useState(true);
  const [notifRegistro, setNotifRegistro] = useState(true);
  const [tono, setTonoState] = useState<TonoNotif>("off");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Al elegir un archivo, lo abrimos en el recortador (no lo subimos directo).
  function seleccionarFoto(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [walletErc20, setWalletErc20] = useState("");
  const [walletTrc20, setWalletTrc20] = useState("");
  const [savingWallets, setSavingWallets] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setLoading(false);
        return;
      }
      setEmail(user.email ?? "");

      // Dos consultas en paralelo (la fecha de nacimiento ya viene del perfil
      // compartido, así no repetimos la misma fila de affiliates).
      // Las preferencias de notificaciones (notif_ftd/notif_registro) van en el
      // MISMO select del perfil. Si el select fallara (columnas aún sin crear),
      // reintentamos sin ellas para no romper la página.
      let perfilRes = await supabase
        .from("affiliates")
        .select("avatar_url, accepted_terms, accepted_privacy, display_name, wallet_erc20, wallet_trc20, notif_ftd, notif_registro")
        .eq("user_id", user.id)
        .single();
      if (perfilRes.error) {
        perfilRes = await supabase
          .from("affiliates")
          .select("avatar_url, accepted_terms, accepted_privacy, display_name, wallet_erc20, wallet_trc20")
          .eq("user_id", user.id)
          .single();
      }

      const data = perfilRes.data as Record<string, unknown> | null;
      if (data) {
        setFirstName((data.display_name as string) ?? "");
        setAcceptedTerms((data.accepted_terms as boolean) ?? false);
        setAcceptedPrivacy((data.accepted_privacy as boolean) ?? false);
        setAvatarUrl((data.avatar_url as string) ?? null);
        setWalletErc20((data.wallet_erc20 as string) ?? "");
        setWalletTrc20((data.wallet_trc20 as string) ?? "");
        setNotifFtd((data.notif_ftd as boolean) ?? true);
        setNotifRegistro((data.notif_registro as boolean) ?? true);
      }

      setLoading(false);
    }
    loadData();
  }, []);

  // Guarda una preferencia de notificación (optimista, blindado).
  async function guardarNotif(campo: "notif_ftd" | "notif_registro", valor: boolean) {
    if (campo === "notif_ftd") setNotifFtd(valor);
    else setNotifRegistro(valor);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from("affiliates")
      .update({ [campo]: valor })
      .eq("user_id", session.user.id)
      .then(() => {}, () => {});
  }

  // Fecha de nacimiento inicial desde el perfil compartido (sin consulta extra).
  useEffect(() => {
    if (perfilBirthdate) setBirthdate(String(perfilBirthdate).slice(0, 10));
  }, [perfilBirthdate]);

  // Tono de sonido guardado en este dispositivo.
  useEffect(() => {
    setTonoState(getTono());
  }, []);
  const elegirTono = (t: TonoNotif) => {
    setTonoState(t);
    setTono(t);
    reproducirSonido(t); // preview
  };

  async function uploadAvatar(file: File) {
    setUploading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setUploading(false);
      return;
    }

    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setMessage("Error al subir la foto");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    await supabase.from("affiliates").update({ avatar_url: publicUrl }).eq("user_id", user.id);

    setAvatarUrl(publicUrl);
    // El menú lateral refleja la nueva foto al instante, sin recargar.
    window.dispatchEvent(
      new CustomEvent("profile-updated", { detail: { avatar_url: publicUrl } })
    );
    setUploading(false);
  }

  async function savePersonal() {
    setSaving(true);
    setMessage(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setSaving(false);
      return;
    }

    const cleanEmail = email.trim();
    const emailChanged = !!cleanEmail && cleanEmail !== user.email;

    // Validación de formato de email en cliente (no hay <form> que la dispare).
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage("El correo no tiene un formato válido.");
      setSaving(false);
      return;
    }

    // El nombre no puede llevar emojis (afea la web y rompe iniciales/avatar).
    if (contieneEmoji(firstName)) {
      setMessage("El nombre no puede tener emojis.");
      setSaving(false);
      return;
    }

    const upd: Record<string, unknown> = {
      first_name: firstName.trim(),
      display_name: firstName.trim(),
    };
    if (birthdate) upd.birthdate = birthdate;
    let { error } = await supabase
      .from("affiliates")
      .update(upd)
      .eq("user_id", user.id);
    // Por si la columna 'birthdate' aún no existe: reintenta sin ella.
    if (error && birthdate) {
      delete upd.birthdate;
      const r = await supabase.from("affiliates").update(upd).eq("user_id", user.id);
      error = r.error;
    }

    let emailError = false;
    if (!error && emailChanged) {
      const res = await fetch("/api/account/update-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ userId: user.id, newEmail: cleanEmail }),
      });
      if (!res.ok) emailError = true;
    }

    setSaving(false);
    if (error) {
      setMessage(
        error.code === "23505"
          ? "Ese nombre de usuario ya está en uso, elige otro."
          : "Error al guardar"
      );
    } else if (emailError) {
      // El nombre SÍ se guardó; solo falló el correo. No mentimos con "todo ok".
      setMessage(
        "Tu usuario se guardó, pero no se pudo cambiar el correo. Inténtalo de nuevo."
      );
    } else {
      setMessage("Guardado correctamente");
      // Avisamos al menú lateral para que refleje el nuevo nombre al instante,
      // sin recargar toda la app (antes se hacía window.location.reload()).
      window.dispatchEvent(
        new CustomEvent("profile-updated", {
          detail: { display_name: firstName.trim() },
        })
      );
    }
  }

  async function savePassword() {
    setMessage(null);
    if (newPassword.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Las contraseñas no coinciden");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      setMessage(traducirError(error.message));
    } else {
      setMessage("Contraseña actualizada");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function saveWallets() {
    setMessage(null);
    const erc = walletErc20.trim();
    const trc = walletTrc20.trim();
    if (erc && !/^0x[a-fA-F0-9]{40}$/.test(erc)) {
      setMessage("La billetera de Ethereum (ERC-20) no parece válida. Debe empezar por 0x.");
      return;
    }
    if (trc && !/^T[a-zA-Z0-9]{33}$/.test(trc)) {
      setMessage("La billetera de Tron (TRC-20) no parece válida. Debe empezar por T.");
      return;
    }
    setSavingWallets(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSavingWallets(false);
      return;
    }
    const res = await fetch("/api/account/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ walletErc20: erc, walletTrc20: trc }),
    });
    setSavingWallets(false);
    setMessage(res.ok ? "Guardado correctamente" : "Error al guardar");
  }


  if (loading) {
    return <CardsSkeleton title="Configuración de Cuenta" cards={2} />;
  }

  const tabs = [
    { key: "personal", label: "Información Personal" },
    { key: "cobro", label: "Datos de cobro" },
    { key: "seguridad", label: "Seguridad" },
    { key: "privacidad", label: "Ajustes de Privacidad" },
  ] as const;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">Configuración de Cuenta</h1>

      <div className="flex gap-2 border-b border-white/10 overflow-x-auto min-w-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              setMessage(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === t.key
                ? "border-emerald-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p
          className={`text-sm ${
            /correctamente|actualizada/i.test(message)
              ? "text-emerald-400"
              : "text-red-400"
          }`}
        >
          {message}
        </p>
      )}{activeTab === "personal" && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xl font-semibold overflow-hidden shrink-0 relative">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Foto de perfil" fill className="object-cover" />
              ) : (
                firstName ? firstName[0].toUpperCase() : "?"
              )}
            </div>
            <div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && seleccionarFoto(e.target.files[0])}
                className="hidden"
              />
              {cropSrc && (
                <AvatarCropper
                  src={cropSrc}
                  onCancel={() => setCropSrc(null)}
                  onConfirm={(blob) => {
                    setCropSrc(null);
                    uploadAvatar(
                      new File([blob], "avatar.jpg", { type: "image/jpeg" })
                    );
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
              >
                {uploading ? "Subiendo..." : "Cambiar foto"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Nombre de usuario</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          
          <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Fecha de nacimiento</label>
            <input
              type="date"
              value={birthdate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthdate(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white px-4 py-2.5 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={savePersonal}
            disabled={saving}
            className="mt-2 w-fit rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>

          <div className="border-t border-white/10 pt-4 mt-1">
            <p className="text-sm font-medium text-slate-200 mb-2">Notificaciones</p>
            <PushToggle />
            <div className="mt-3">
              <p className="text-xs text-slate-400 mb-2">Avísame de:</p>
              <div className="flex flex-col gap-2">
                {[
                  { campo: "notif_ftd" as const, label: "Nuevos FTD 🎉", val: notifFtd },
                  { campo: "notif_registro" as const, label: "Nuevos registros 👀", val: notifRegistro },
                ].map((o) => (
                  <button
                    key={o.campo}
                    type="button"
                    onClick={() => guardarNotif(o.campo, !o.val)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition"
                  >
                    <span>{o.label}</span>
                    <span
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                        o.val ? "bg-emerald-500" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          o.val ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-slate-400 mb-2">Sonido al entrar un QFTD:</p>
              <div className="flex items-center gap-2">
                <select
                  value={tono}
                  onChange={(e) => elegirTono(e.target.value as TonoNotif)}
                  className="flex-1 max-w-xs rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {TONOS.map((o) => (
                    <option key={o.id} value={o.id} className="bg-black">
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => reproducirSonido(tono)}
                  disabled={tono === "off"}
                  className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40"
                >
                  ▶ Probar
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Al elegir un tono suena solo. Se oye en este dispositivo cuando
                entra un QFTD nuevo.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "cobro" && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4">
          <p className="text-sm text-slate-300">Los pagos se realizan en USDT.</p>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Billetera USDT · Ethereum (ERC-20)
            </label>
            <input
              type="text"
              value={walletErc20}
              onChange={(e) => setWalletErc20(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="0x..."
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Billetera USDT · Tron (TRC-20)
            </label>
            <input
              type="text"
              value={walletTrc20}
              onChange={(e) => setWalletTrc20(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="T..."
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={saveWallets}
            disabled={savingWallets}
            className="mt-2 w-fit rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5"
          >
            {savingWallets ? "Guardando..." : "Guardar"}
          </button>
        </div>
      )}

      {activeTab === "seguridad" && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Confirmar contraseña</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button
            onClick={savePassword}
            disabled={saving}
            className="mt-2 w-fit rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5"
          >
            {saving ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </div>
      )}

      {activeTab === "privacidad" && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4">
          <div>
            <p className="text-sm text-slate-400 mb-3">
              Tu consentimiento a los siguientes Términos y Condiciones y Política de Privacidad es obligatorio para poder usar la plataforma.
            </p>
            <label className="flex items-center gap-2 text-sm text-white mb-2">
              <input type="checkbox" checked={acceptedTerms} disabled className="w-4 h-4 accent-emerald-500" />
              He aceptado los{" "}
              <a href="/terminos" target="_blank" className="text-emerald-400 hover:text-emerald-300 underline">Términos y Condiciones</a>
            </label>
            <label className="flex items-center gap-2 text-sm text-white">
              <input type="checkbox" checked={acceptedPrivacy} disabled className="w-4 h-4 accent-emerald-500" />
              He aceptado la{" "}
              <a href="/privacidad" target="_blank" className="text-emerald-400 hover:text-emerald-300 underline">Política de Privacidad</a>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}