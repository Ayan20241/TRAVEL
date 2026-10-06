"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import {
  TripFull,
  DisruptionFull,
  OpSummary,
  OPEN_DISRUPTION_STATUSES,
  useApi,
  DataView,
  StatusBadge,
} from "./_shared";
import { Card, PageHeader, fmtMoney, fmtDate } from "@/components/ui";

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-ink-900">{value}</p>
    </Card>
  );
}

export default function OperatorDashboard() {
  const summary = useApi<OpSummary>("/api/v1/operator/summary");
  const disrupted = useApi<TripFull[]>("/api/v1/trips?status=DISRUPTED&page_size=20");
  const inProgress = useApi<TripFull[]>("/api/v1/trips?status=IN_PROGRESS&page_size=20");
  const bookingsPending = useApi<{ status: string }[]>("/api/v1/bookings");

  return (
    <>
      <PageHeader title="Operations dashboard" subtitle="Live view of tours, disruptions, and bookings" />
      <DataView
        loading={summary.loading}
        error={summary.error}
        empty={false}
        onRetry={summary.refetch}
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Active tours" value={summary.data?.active_tours ?? 0} accent="bg-emerald-500" />
          <StatCard label="Disrupted tours" value={summary.data?.disrupted_tours ?? 0} accent="bg-red-500" />
          <StatCard label="Open disruptions" value={summary.data?.open_disruptions ?? 0} accent="bg-amber-500" />
          <StatCard
            label="Pending bookings"
            value={summary.data?.pending_bookings ?? 0}
            accent="bg-blue-500"
          />
          <StatCard
            label="Confirmed revenue"
            value={fmtMoney(summary.data?.confirmed_revenue ?? 0)}
            accent="bg-brand-500"
          />
          <StatCard label="Travelers" value={summary.data?.travelers ?? 0} accent="bg-indigo-500" />
        </div>
      </DataView>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-900">Disrupted tours</h2>
            <Link href="/operator/disruptions" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              View all →
            </Link>
          </div>
          <DataView
            loading={disrupted.loading}
            error={disrupted.error}
            empty={(disrupted.data?.length ?? 0) === 0}
            onRetry={disrupted.refetch}
            emptyTitle="No disrupted tours"
            emptyHint="Tours that hit a disruption will appear here."
          >
            <Card className="!p-0 overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {(disrupted.data ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/operator/trips/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{t.title}</p>
                        <p className="text-xs text-ink-500">
                          {t.destination} · {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
                        </p>
                      </div>
                      <StatusBadge value={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </DataView>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-900">Tours in progress</h2>
            <Link href="/operator/trips?status=IN_PROGRESS" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              View all →
            </Link>
          </div>
          <DataView
            loading={inProgress.loading}
            error={inProgress.error}
            empty={(inProgress.data?.length ?? 0) === 0}
            onRetry={inProgress.refetch}
            emptyTitle="No tours in progress"
            emptyHint="Confirmed tours that have started will appear here."
          >
            <Card className="!p-0 overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {(inProgress.data ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/operator/trips/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{t.title}</p>
                        <p className="text-xs text-ink-500">
                          {t.destination} · Day trip ends {fmtDate(t.end_date)}
                        </p>
                      </div>
                      <StatusBadge value={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </DataView>
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">Open disruptions needing action</h2>
          <Link href="/operator/disruptions" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Open disruption console →
          </Link>
        </div>
        <OpenDisruptionPreview />
      </section>
      <PendingBookingsHint data={bookingsPending.data} />
    </>
  );
}

function OpenDisruptionPreview() {
  const trips = useApi<TripFull[]>("/api/v1/trips?page_size=50");
  const [rows, setRows] = useState<{ trip: TripFull; d: DisruptionFull }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trips.data) return;
      setLoading(true);
      setError(null);
      try {
        const out: { trip: TripFull; d: DisruptionFull }[] = [];
        const targets = trips.data.filter((t) => ["DISRUPTED", "IN_PROGRESS", "BOOKED", "READY"].includes(t.status));
        const results = await Promise.all(
          targets.map(async (t) => {
            try {
              const ds = await api<DisruptionFull[]>(`/api/v1/trips/${t.id}/disruptions`);
              return ds.filter((d) => OPEN_DISRUPTION_STATUSES.includes(d.status)).map((d) => ({ trip: t, d }));
            } catch {
              return [];
            }
          })
        );
        if (!cancelled) setRows(results.flat().slice(0, 6));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trips.data]);

  return (
    <DataView
      loading={trips.loading || loading}
      error={trips.error || error}
      empty={rows.length === 0}
      onRetry={() => trips.refetch()}
      emptyTitle="No open disruptions"
      emptyHint="All tours are running smoothly right now."
    >
      <Card className="!p-0 overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {rows.map(({ trip, d }) => (
            <li key={d.id}>
              <Link href={`/operator/trips/${trip.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {d.type.replace(/_/g, " ")} — {trip.title}
                  </p>
                  <p className="text-xs text-ink-500">
                    {d.delay_minutes > 0 ? `Delayed ${d.delay_minutes} min · ` : ""}
                    {d.reason || "No reason recorded"} · {fmtDate(d.created_at)}
                  </p>
                </div>
                <StatusBadge value={d.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </DataView>
  );
}

function PendingBookingsHint({ data }: { data: { status: string }[] | null }) {
  if (!data) return null;
  const pending = data.filter((b) => b.status === "PENDING").length;
  if (pending === 0) return null;
  return (
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <span className="font-semibold">{pending} booking{pending === 1 ? "" : "s"} awaiting confirmation.</span>{" "}
      <Link href="/operator/bookings?status=PENDING" className="font-semibold underline hover:text-amber-700">
        Review them →
      </Link>
    </div>
  );
}
