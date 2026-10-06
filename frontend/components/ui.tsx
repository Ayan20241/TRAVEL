"use client";
import React from "react";

export function Button({ className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50 ${className}`}
      {...p}
    />
  );
}

export function GhostButton({ className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-slate-50 disabled:opacity-50 ${className}`}
      {...p}
    />
  );
}

export function Card({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`} {...p} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      {...props}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{children}</label>;
}

const badgeColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PLANNING: "bg-amber-100 text-amber-800",
  READY: "bg-blue-100 text-blue-800",
  BOOKED: "bg-indigo-100 text-indigo-800",
  IN_PROGRESS: "bg-emerald-100 text-emerald-800",
  DISRUPTED: "bg-red-100 text-red-800",
  COMPLETED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
  BROKEN: "bg-red-100 text-red-800",
  AT_RISK: "bg-amber-100 text-amber-800",
  FLAGGED: "bg-yellow-100 text-yellow-800",
  UNAFFECTED: "bg-emerald-100 text-emerald-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  PLANNED: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-800",
  OPEN: "bg-red-100 text-red-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
};

export function Badge({ value }: { value: string }) {
  const c = badgeColors[value] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
      <p className="text-base font-semibold text-ink-900">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-16 text-center">
      <p className="text-base font-semibold text-red-800">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          Try again
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function fmtMoney(n: number | null | undefined, currency = "INR") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
