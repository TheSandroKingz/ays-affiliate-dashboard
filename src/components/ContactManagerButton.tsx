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
          <div className="w-full max-w-md rounded-xl border border-white/20 bg-black/95 p-5 sm:p-4"><div className="flex items-start justify-between">
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

            <div className="mt-4 sm:mt-3 flex flex-col items-center gap-2 sm:gap-1 text-white text-center">
              <div className="w-28 h-28 rounded-full overflow-hidden relative shrink-0 bg-emerald-600">
              <Image src={CONTACT.photoUrl} alt={CONTACT.name} fill className="object-cover" />
            </div>
              <span className="text-xl font-semibold text-emerald-400">{CONTACT.name}</span>
            </div>

            <div className="mt-3 sm:mt-2 space-y-2 sm:space-y-1">
              <button
              onClick={() => (window.location.href = `mailto:${CONTACT.email}`)}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 p-2.5 sm:p-2 text-left text-slate-200 hover:border-emerald-400/40 hover:text-emerald-300 transition"
            >
              <Mail size={18} />
              <span className="truncate">{CONTACT.email}</span>
            </button>

              <button
              onClick={() => window.open(`https://t.me/${CONTACT.telegram.replace("@", "")}`, "_blank")}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 p-2.5 sm:p-2 text-left text-slate-200 hover:border-emerald-400/40 hover:text-emerald-300 transition"
            >
              <Send size={18} />
              <span>{CONTACT.telegram}</span>
            </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}