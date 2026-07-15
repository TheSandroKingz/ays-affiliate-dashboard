"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { CardsSkeleton } from "@/components/Skeletons";
import { traducirError } from "@/lib/authErrors";

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<
    "personal" | "pago" | "seguridad" | "privacidad"
  >("personal");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

      const { data } = await supabase
        .from("affiliates")
        .select("first_name, last_name, phone, avatar_url, accepted_terms, accepted_privacy, display_name")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setFirstName(data.display_name ?? "");
      setAcceptedTerms(data.accepted_terms ?? false);
      setAcceptedPrivacy(data.accepted_privacy ?? false);
      setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    }
    loadData();
  }, []);async function uploadAvatar(file: File) {
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

    const { error } = await supabase
      .from("affiliates")
      .update({
        first_name: firstName,
        
        display_name: firstName,
      })
      .eq("user_id", user.id);

    let emailError = false;
    if (!error && email && email !== user.email) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/account/update-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (session?.access_token ?? ""),
        },
        body: JSON.stringify({ userId: user.id, newEmail: email }),
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
      setMessage("Error al actualizar el correo");
    } else {
      setMessage("Guardado correctamente");
    }
    if (!error && !emailError) {
      setTimeout(() => window.location.reload(), 800);
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


  if (loading) {
    return <CardsSkeleton title="Configuración de Cuenta" cards={2} />;
  }

  const tabs = [
    { key: "personal", label: "Información Personal" },
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
        <p className="text-sm text-emerald-300">{message}</p>
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
                onChange={(e) => e.target.files && uploadAvatar(e.target.files[0])}
                className="hidden"
              />
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
          
          <button
            onClick={savePersonal}
            disabled={saving}
            className="mt-2 w-fit rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}

      {activeTab === "seguridad" && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
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