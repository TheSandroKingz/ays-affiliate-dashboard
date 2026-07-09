"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  CreditCard,
  Users,
  BookOpen,
  ChevronDown,
  X,
} from "lucide-react";

const reportLinks = [
  { name: "Media Report", href: "/dashboard/reports/media" },
  { name: "Registrations Report", href: "/dashboard/reports/registrations" },
  { name: "Activity Report", href: "/dashboard/reports/activity" },
  { name: "Earnings Report", href: "/dashboard/reports/earnings" },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/dashboard/reports"));

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? "bg-blue-50 text-blue-600"
        : "text-gray-600 hover:bg-gray-100"
    }`;return (
    <aside
      className={`fixed md:static top-0 left-0 h-full w-64 shrink-0 border-r border-gray-200 bg-white py-6 px-3 z-50 transform transition-transform duration-200 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <button
        onClick={onClose}
        className="md:hidden flex items-center gap-2 text-gray-500 mb-4 px-4"
      >
        <X size={20} />
        Cerrar
      </button>

      <nav className="flex flex-col gap-1">
        <Link href="/dashboard" className={linkClass("/dashboard")} onClick={onClose}>
          <LayoutDashboard size={18} />
          Dashboard
        </Link>

        <button
          onClick={() => setReportsOpen(!reportsOpen)}
          className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <span className="flex items-center gap-3">
            <ClipboardList size={18} />
            Reports
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
          Payments
        </Link>

        <Link href="/dashboard/sub-affiliates" className={linkClass("/dashboard/sub-affiliates")} onClick={onClose}>
          <Users size={18} />
          Sub Affiliates
        </Link>

        <Link href="/dashboard/commission-plan" className={linkClass("/dashboard/commission-plan")} onClick={onClose}>
          <BookOpen size={18} />
          Commission Plan
        </Link>
      </nav>
    </aside>
  );
}