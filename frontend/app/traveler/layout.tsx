"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, RequireAuth, useAuth } from "@/components/AuthProvider";

const nav = [
  { href: "/traveler", label: "Dashboard", icon: "🏠" },
  { href: "/traveler/trips/new", label: "Plan new trip", icon: "✈️" },
  { href: "/traveler/bookings", label: "Bookings", icon: "🎫" },
  { href: "/traveler/profile", label: "Profile", icon: "👤" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const doSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const links = (
    <>
      {nav.map((n) => {
        const active = n.href === "/traveler" ? pathname === "/traveler" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              active ? "bg-brand-600 text-white shadow-sm" : "text-ink-700 hover:bg-slate-100"
            }`}
          >
            <span className="text-lg">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/traveler" className="text-lg font-extrabold tracking-tight text-ink-900">
          TourFlow <span className="text-brand-600">AI</span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-ink-700"
          aria-label="Toggle menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </header>
      {open && (
        <nav className="space-y-1 border-b border-slate-200 bg-white p-4 lg:hidden">{links}</nav>
      )}

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
          <Link href="/traveler" className="px-2 text-xl font-extrabold tracking-tight text-ink-900">
            TourFlow <span className="text-brand-600">AI</span>
          </Link>
          <nav className="mt-8 flex-1 space-y-1">{links}</nav>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name || profile?.email}</p>
            <p className="text-xs text-ink-500">{profile?.role}</p>
            <button onClick={doSignOut} className="mt-2 text-sm font-semibold text-red-600 hover:underline">
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Mobile bottom sign-out */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button onClick={doSignOut} className="text-sm font-semibold text-red-600">
          Sign out {profile?.email ? `(${profile.email})` : ""}
        </button>
      </div>
    </div>
  );
}

export default function TravelerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RequireAuth roles={["TRAVELER", "OPERATOR", "ADMIN"]}>
        <Shell>{children}</Shell>
      </RequireAuth>
    </AuthProvider>
  );
}
