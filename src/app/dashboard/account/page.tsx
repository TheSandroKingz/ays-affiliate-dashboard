"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

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
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setEmail(user.email ?? "");

      const { data } = await supabase
        .from("affiliates")
        .select("first_name, last_name, phone, payment_method, payment_details, email_notifications, avatar_url")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setPhone(data.phone ?? "");
        setPaymentMethod(data.payment_method ?? "");
        setPaymentDetails(data.payment_details ?? "");
        setEmailNotifications(data.email_notifications ?? true);
      setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    }
    loadData();
  }, []);async function uploadAvatar(file: File) {
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("affiliates")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        display_name: firstName,
      })
      .eq("user_id", user.id);

    setSaving(false);
    if (error) {
      setMessage(
        error.code === "23505"
          ? "Ese nombre de usuario ya esta en uso, elige otro."
          : "Error al guardar"
      );
    } else {
      setMessage("Guardado correctamente");
    }
    if (!error) {
      setTimeout(() => window.location.reload(), 800);
    }
  }

  async function savePago() {
    setSaving(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("affiliates")
      .update({
        payment_method: paymentMethod,
        payment_details: paymentDetails,
      })
      .eq("user_id", user.id);

    setSaving(false);
    setMessage(error ? "Error al guardar" : "Guardado correctamente");
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
      setMessage(error.message);
    } else {
      setMessage("Contraseña actualizada");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function savePrivacidad() {
    setSaving(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("affiliates")
      .update({ email_notifications: emailNotifications })
      .eq("user_id", user.id);

    setSaving(false);
    setMessage(error ? "Error al guardar" : "Guardado correctamente");
  }if (loading) {
    return <p className="text-slate-300">Cargando...</p>;
  }

  const tabs = [
    { key: "personal", label: "Información Personal" },
    { key: "pago", label: "Detalles de Pago" },
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
            <label className="block text-sm font-medium text-slate-200 mb-1">Nombre</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Apellido</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-lg bg-white/5 border border-white/10 text-slate-400 px-4 py-2.5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Teléfono</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
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

      {activeTab === "pago" && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Método de pago</label>
            <input
              type="text"
              value={paymentMethod}onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Ej: Transferencia bancaria, PayPal..."
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Detalles de pago</label>
            <textarea
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder="Ej: IBAN, email de PayPal, etc."
              rows={4}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
            />
          </div>
          <button
            onClick={savePago}
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
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 px-4 py-2.5 focus:outline-none"
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Notificaciones por correo</p>
              <p className="text-sm text-slate-400">Recibe novedades y avisos importantes por email</p>
            </div>
            <button
              onClick={() => setEmailNotifications(!emailNotifications)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                emailNotifications ? "bg-emerald-600" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  emailNotifications ? "translate-x-6" : ""
                }`}
              />
            </button>
          </div>
          <button
            onClick={savePrivacidad}
            disabled={saving}
            className="mt-2 w-fit rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}