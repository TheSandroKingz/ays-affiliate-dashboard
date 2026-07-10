"use client";

import { useState } from "react";
import { Mail, Send, User, X } from "lucide-react";

const CONTACT = {
  name: "Adri",
  email: "contratacionesadriperez@gmail.com",
  telegram: "@ADRIFTD",
};

export default function ContactManagerButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition"
      >
        Póngase en contacto con el gestor de afiliados
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/20 bg-slate-800 p-6"><div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-400">Información de contacto</p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  Póngase en contacto con el gestor de afiliados
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 text-white">
              <User size={18} />
              <span>{CONTACT.name}</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <Mail size={18} />
                  <span className="break-all">{CONTACT.email}</span>
                </div>
                <button
                  onClick={() => copy(CONTACT.email, "email")}
                  className="shrink-0 text-sm font-medium text-blue-400 hover:text-blue-300"
                >
                  {copied === "email" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <Send size={18} />
                  <span>{CONTACT.telegram}</span>
                </div>
                <button
                  onClick={() => copy(CONTACT.telegram, "telegram")}
                  className="shrink-0 text-sm font-medium text-blue-400 hover:text-blue-300"
                >
                  {copied === "telegram" ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}