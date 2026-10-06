"use client";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Spinner, ErrorState, EmptyState, Badge, GhostButton } from "@/components/ui";

/* ---------- shared operator types (extend client-api types locally) ---------- */

export type Role = "TRAVELER" | "OPERATOR" | "COORDINATOR" | "VENDOR" | "ADMIN";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  phone: string | null;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  created_at: string;
};

export type OpSummary = {
  active_tours: number;
  disrupted_tours: number;
  open_disruptions: number;
  pending_bookings: number;
  confirmed_revenue: number;
  travelers: number;
};

export type Pricing = {
  trip_id: string;
  currency: string;
  transportation: number;
  accommodation: number;
  activities: number;
  other: number;
  base_cost: number;
  additional_cost: number;
  discount: number;
  estimated_total: number;
  budget: number | null;
  within_budget: boolean | null;
};

export type ImpactViolation = {
  item_id?: string;
  rule?: string;
  severity?: string;
  expected_value?: unknown;
  actual_value?: unknown;
  message?: string;
};

export type ImpactResult = {
  evaluation_id: string;
  feasible: boolean;
  affected_items: Record<string, string>;
  broken_items: string[];
  at_risk_items: string[];
  violations: ImpactViolation[];
  warnings: ImpactViolation[];
  explanation: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  read: boolean;
  trip_id: string | null;
  created_at: string;
};

export type TripFull = {
  id: string;
  traveler_id: string;
  operator_id: string | null;
  coordinator_id: string | null;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  budget: number | null;
  currency: string;
  status: string;
  travel_style: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingFull = {
  id: string;
  trip_id: string;
  traveler_id: string;
  vendor_id: string | null;
  service_type: string;
  service_name: string;
  reference_code: string | null;
  status: string;
  amount: number | null;
  currency: string;
  booked_at: string | null;
  notes: string | null;
};

export type ItineraryItemFull = {
  id: string;
  trip_id: string;
  type: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  cost: number | null;
  currency: string;
  status: string;
  booked_status: string;
  is_fixed: boolean;
  vendor_id: string | null;
  booking_id: string | null;
  sequence_order: number;
};

export type DisruptionFull = {
  id: string;
  trip_id: string;
  type: string;
  source_item_id: string | null;
  original_start_time: string | null;
  new_start_time: string | null;
  delay_minutes: number;
  reason: string | null;
  status: string;
  created_at: string;
};

export type RecoveryOptionFull = {
  id: string;
  trip_id: string;
  disruption_id: string;
  action: string;
  title: string;
  description: string | null;
  estimated_cost_delta: number;
  experience_impact: string | null;
  feasibility: boolean;
  ai_rank: number | null;
  ai_reason: string | null;
  affected_items: string[];
  changes: Record<string, unknown>;
  reason: string | null;
  selected: boolean;
};

export const OPEN_DISRUPTION_STATUSES = ["OPEN", "ANALYZED", "RECOVERY_PROPOSED"];

/* ---------- data-fetch hook ---------- */

export function useApi<T>(path: string | null, depsKey = "") {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, depsKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

/* ---------- page state wrapper ---------- */

export function DataView({
  loading,
  error,
  empty,
  onRetry,
  children,
  emptyTitle = "Nothing here yet",
  emptyHint,
  emptyAction,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry: () => void;
  children: React.ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
}) {
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  return <>{children}</>;
}

/* ---------- table shell ---------- */

export function TableShell({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

/* ---------- status badge ---------- */

export function StatusBadge({ value }: { value: string }) {
  return <Badge value={value} />;
}

/* ---------- confirm dialog ---------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-ink-900">{title}</h2>
        {body && <p className="mt-2 text-sm text-ink-500">{body}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <GhostButton onClick={onCancel} disabled={busy}>
            Cancel
          </GhostButton>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- modal form shell ---------- */

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-ink-500 hover:bg-slate-100" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
