"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Image from "next/image";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-black">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0">
        <div className={`${sidebarOpen ? "hidden" : "flex"} md:hidden sticky top-0 z-30 bg-black/80 backdrop-blur border-b border-white/10 items-center px-4 py-3`}>
          <button onClick={() => setSidebarOpen(true)} className="text-white p-2 -ml-2">
            <Menu size={24} />
          </button>
          <span className="flex-1 flex justify-center pr-6">
            <Image src="/logo.png" alt="A&S Afiliados" width={120} height={59} priority />
          </span>
        </div>

        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
