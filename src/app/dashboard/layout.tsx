"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Image from "next/image";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-black">
<div className={`${sidebarOpen ? "hidden" : "flex"} md:hidden fixed top-0 left-0 right-0 z-30 bg-black/80 backdrop-blur border-b border-white/10 items-center px-4 py-3`}>        <button onClick={() => setSidebarOpen(true)} className="text-white">
          <Menu size={24} />
        </button>
          <span className="flex-1 flex justify-center pr-6">
            <Image src="/logo.png" alt="A&S Afiliados" width={120} height={59} priority />
          </span>
      </div>

      {sidebarOpen && (
        <div
         className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 min-w-0 p-8 pt-20 md:pt-8">{children}</main>
    </div>
  );
}