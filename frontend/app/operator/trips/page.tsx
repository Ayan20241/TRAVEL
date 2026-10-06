"use client";
import Link from "next/link";
import { useState } from "react";
import { TripFull, useApi, DataView, TableShell, Td, StatusBadge } from "../_shared";
import { PageHeader, Select, fmtDate, fmtMoney } from "@/components/ui";

const STATUSES = ["", "DRAFT", "PLANNING", "READY", "BOOKED", "IN_PROGRESS", "DISRUPTED", "COMPLETED", "CANCELLED"];

export default function TripsPage({ searchParams }: { searchParams?: { status?: string } }) {
  const [status, setStatus] = useState(searchParams?.status || "");
  const path = `/api/v1/trips${status ? `?status=${status}` : ""}&page_size=100`;
  const { data, loading, error, refetch } = useApi<TripFull[]>(path.replace("?&", "?"));
  const trips = data ?? [];

  return (
    <>
      <PageHeader
        title="Trips"
        subtitle="Every trip on the platform. Select one to manage its itinerary, bookings, and disruptions."
        action={
          <div className="w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "" ? "All statuses" : s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <DataView
        loading={loading}
        error={error}
        empty={trips.length === 0}
        onRetry={refetch}
        emptyTitle="No trips found"
        emptyHint={status ? "No trips with this status yet." : "Trips created by travelers will appear here."}
      >
        <TableShell head={["Trip", "Destination", "Dates", "Budget", "Status", ""]}>
          {trips.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50">
              <Td>
                <p className="font-semibold text-ink-900">{t.title}</p>
                <p className="text-xs text-ink-500">{t.duration_days} days · {t.travel_style || "no style set"}</p>
              </Td>
              <Td>{t.destination}</Td>
              <Td className="whitespace-nowrap">
                {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
              </Td>
              <Td className="whitespace-nowrap">{fmtMoney(t.budget, t.currency)}</Td>
              <Td>
                <StatusBadge value={t.status} />
              </Td>
              <Td className="text-right">
                <Link href={`/operator/trips/${t.id}`} className="font-semibold text-brand-600 hover:text-brand-700">
                  Manage →
                </Link>
              </Td>
            </tr>
          ))}
        </TableShell>
      </DataView>
    </>
  );
}
