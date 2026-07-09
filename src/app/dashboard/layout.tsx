"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 flex items-center px-4 py-3">
        <button onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-8 pt-20 md:pt-8">{children}</main>
    </div>
  );
}