"use client";

import { useState } from "react";
import { Mail, Send, X } from "lucide-react";
import Image from "next/image";

const CONTACT = {
  name: "Adri",
  email: "contratacionesadriperez@gmail.com",
  telegram: "@ADRIFTD",
  photoUrl: "/manager.jpg",
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
          <div className="w-full max-w-lg rounded-xl border border-white/20 bg-black/95 p-6"><div className="flex items-start justify-between">
              <div>
                
                <h2 className="hidden">
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

            <div className="mt-4 flex flex-col items-center gap-2 text-white text-center">
              <div className="w-28 h-28 rounded-full overflow-hidden relative shrink-0 bg-emerald-600">
              <Image src={CONTACT.photoUrl} alt={CONTACT.name} fill className="object-cover" />
            </div>
              <span className="text-lg font-semibold">{CONTACT.name}</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-slate-200 min-w-0">
                  <Mail size={18} />
                  <span className="truncate">{CONTACT.email}</span>
                </div>
                <button
                  onClick={() => (window.location.href = `mailto:${CONTACT.email}`)}
                  className="shrink-0 text-sm font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Escribir
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <Send size={18} />
                  <span>{CONTACT.telegram}</span>
                </div>
                <button
                  onClick={() => window.open(`https://t.me/${CONTACT.telegram.replace("@", "")}`, "_blank")}
                  className="shrink-0 text-sm font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Abrir chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}