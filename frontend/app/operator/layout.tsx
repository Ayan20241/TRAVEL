"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthProvider, RequireAuth, useAuth } from "@/components/AuthProvider";
import { useApi, Notification } from "./_shared";

const NAV = [
  { href: "/operator", label: "Dashboard", glyph: "▦" },
  { href: "/operator/trips", label: "Trips", glyph: "✈" },
  { href: "/operator/customers", label: "Customers", glyph: "◉" },
  { href: "/operator/bookings", label: "Bookings", glyph: "▤" },
  { href: "/operator/vendors", label: "Vendors", glyph: "◈" },
  { href: "/operator/hotels", label: "Hotels", glyph: "⌂" },
  { href: "/operator/activities", label: "Activities", glyph: "◍" },
  { href: "/operator/transportation", label: "Transportation", glyph: "▸" },
  { href: "/operator/disruptions", label: "Disruptions", glyph: "⚠" },
  { href: "/operator/audit", label: "Audit Logs", glyph: "☰" },
  { href: "/operator/settings", label: "Settings", glyph: "⚙" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const { data: notes } = useApi<Notification[]>("/api/v1/notifications?unread_only=true");
  const unread = notes?.length ?? 0;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const isActive = (href: string) => (href === "/operator" ? pathname === href : pathname?.startsWith(href));

  const navList = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={() => setDrawer(false)}
          className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
            isActive(n.href)
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <span className="w-5 text-center text-base leading-none">{n.glyph}</span>
          {n.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-slate-900">{navList}</aside>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-900 lg:flex">
        <div className="px-5 pb-4 pt-6">
          <p className="text-lg font-bold tracking-tight text-white">TourFlow AI</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-brand-100/70">Operator Console</p>
        </div>
        <div className="flex-1 overflow-y-auto">{navList}</div>
        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-xs text-slate-400">{profile?.email || user?.email}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-brand-100/70">{profile?.role}</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-ink-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">
              {profile?.full_name || profile?.email || user?.email}
            </p>
          </div>
          <Link
            href="/operator/disruptions"
            className="relative rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
            title="Open disruptions"
          >
            ⚠ Alerts
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <button
            onClick={handleSignOut}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RequireAuth roles={["OPERATOR", "ADMIN"]}>
        <Shell>{children}</Shell>
      </RequireAuth>
    </AuthProvider>
  );
}
