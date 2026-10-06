"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { BookingFull, TripFull, useApi, DataView, TableShell, Td, StatusBadge, ConfirmDialog } from "../_shared";
import { PageHeader, Select, fmtMoney, fmtDate } from "@/components/ui";

const STATUSES = ["", "PLANNED", "PENDING", "CONFIRMED", "CANCELLED", "REBOOKED", "COMPLETED"];

export default function BookingsPage({ searchParams }: { searchParams?: { status?: string } }) {
  const [status, setStatus] = useState(searchParams?.status || "");
  const b = useApi<BookingFull[]>(`/api/v1/bookings`);
  const trips = useApi<TripFull[]>(`/api/v1/trips?page_size=100`);
  const [target, setTarget] = useState<BookingFull | null>(null);
  const [action, setAction] = useState<"CONFIRMED" | "CANCELLED" | null>(null);
  const [busy, setBusy] = useState(false);

  const tripTitles = new Map((trips.data ?? []).map((t) => [t.id, t.title]));
  const list = (b.data ?? []).filter((bk) => !status || bk.status === status);

  const doUpdate = async () => {
    if (!target || !action) return;
    setBusy(true);
    try {
      await api(`/api/v1/bookings/${target.id}`, { method: "PATCH", body: { status: action } });
      setTarget(null);
      setAction(null);
      b.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Confirm pending bookings or cancel them. Every change is audited."
        action={
          <div className="w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "" ? "All statuses" : s}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <DataView
        loading={b.loading}
        error={b.error}
        empty={list.length === 0}
        onRetry={b.refetch}
        emptyTitle="No bookings found"
        emptyHint={status ? "No bookings with this status." : "Bookings created for trips will appear here."}
      >
        <TableShell head={["Service", "Trip", "Reference", "Amount", "Booked", "Status", "Actions"]}>
          {list.map((bk) => (
            <tr key={bk.id} className="hover:bg-slate-50">
              <Td>
                <p className="font-semibold text-ink-900">{bk.service_name}</p>
                <p className="text-xs text-ink-500">{bk.service_type.replace(/_/g, " ")}</p>
              </Td>
              <Td>
                {tripTitles.has(bk.trip_id) ? (
                  <Link href={`/operator/trips/${bk.trip_id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                    {tripTitles.get(bk.trip_id)}
                  </Link>
                ) : (
                  <span className="text-xs text-ink-500">{bk.trip_id.slice(0, 8)}…</span>
                )}
              </Td>
              <Td className="text-xs">{bk.reference_code || "—"}</Td>
              <Td className="whitespace-nowrap">{fmtMoney(bk.amount, bk.currency)}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-500">{fmtDate(bk.booked_at)}</Td>
              <Td>
                <StatusBadge value={bk.status} />
              </Td>
              <Td>
                <div className="flex gap-2">
                  {bk.status !== "CONFIRMED" && (
                    <button
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                      onClick={() => { setTarget(bk); setAction("CONFIRMED"); }}
                    >
                      Confirm
                    </button>
                  )}
                  {bk.status !== "CANCELLED" && (
                    <button
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                      onClick={() => { setTarget(bk); setAction("CANCELLED"); }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </TableShell>
      </DataView>
      <ConfirmDialog
        open={!!target}
        title={action === "CANCELLED" ? "Cancel booking?" : "Confirm booking?"}
        body={target ? `${target.service_name} (${target.service_type}). This will notify the traveler and be recorded in the audit log.` : undefined}
        confirmLabel={action === "CANCELLED" ? "Cancel booking" : "Confirm booking"}
        danger={action === "CANCELLED"}
        busy={busy}
        onConfirm={doUpdate}
        onCancel={() => { setTarget(null); setAction(null); }}
      />
    </>
  );
}
