"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import {
  TripFull,
  DisruptionFull,
  Profile,
  OPEN_DISRUPTION_STATUSES,
  useApi,
  DataView,
  TableShell,
  Td,
  StatusBadge,
} from "../_shared";
import { PageHeader, Button, fmtDate, fmtTime } from "@/components/ui";

type Row = { trip: TripFull; d: DisruptionFull };

export default function DisruptionsPage() {
  const trips = useApi<TripFull[]>(`/api/v1/trips?page_size=100`);
  const users = useApi<Profile[]>(`/api/v1/users?page_size=100`);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (trips.loading) return;
      if (trips.error) {
        if (!cancelled) {
          setError(trips.error);
          setLoading(false);
        }
        return;
      }
      if (!trips.data) return;
      setLoading(true);
      setError(null);
      try {
        const targets = trips.data.filter((t) =>
          ["DISRUPTED", "IN_PROGRESS", "BOOKED", "READY", "PLANNING"].includes(t.status)
        );
        const results = await Promise.all(
          targets.map(async (t) => {
            try {
              const ds = await api<DisruptionFull[]>(`/api/v1/trips/${t.id}/disruptions`);
              return ds
                .filter((d) => OPEN_DISRUPTION_STATUSES.includes(d.status))
                .map((d) => ({ trip: t, d }));
            } catch {
              return [] as Row[];
            }
          })
        );
        if (!cancelled) {
          const flat = results.flat();
          flat.sort((a, b) => b.d.created_at.localeCompare(a.d.created_at));
          setRows(flat);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips.data, trips.error, trips.loading, key]);

  const travelers = new Map((users.data ?? []).map((u) => [u.id, u]));
  const busy = trips.loading || loading;

  return (
    <>
      <PageHeader
        title="Disruptions"
        subtitle="Every open disruption across all tours. Open a trip to analyze impact and apply recovery."
        action={<Button onClick={() => { trips.refetch(); setKey((k) => k + 1); }}>Refresh</Button>}
      />
      <DataView
        loading={busy}
        error={error}
        empty={rows.length === 0}
        onRetry={() => { trips.refetch(); setKey((k) => k + 1); }}
        emptyTitle="No open disruptions"
        emptyHint="All tours are running smoothly right now."
      >
        <TableShell head={["Disruption", "Traveler", "Trip", "Status", "Reported", ""]}>
          {rows.map(({ trip, d }) => {
            const traveler = travelers.get(trip.traveler_id);
            return (
              <tr key={d.id} className="hover:bg-slate-50">
                <Td>
                  <p className="font-semibold text-ink-900">{d.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-ink-500">
                    {d.delay_minutes > 0 ? `+${d.delay_minutes} min delay · ` : ""}
                    {d.reason || "No reason recorded"}
                  </p>
                </Td>
                <Td>
                  <p className="text-sm font-medium text-ink-900">{traveler?.full_name || "—"}</p>
                  <p className="text-xs text-ink-500">{traveler?.email || trip.traveler_id.slice(0, 8)}</p>
                </Td>
                <Td className="max-w-[220px]">
                  <p className="truncate text-sm">{trip.title}</p>
                  <p className="text-xs text-ink-500">{trip.destination}</p>
                </Td>
                <Td>
                  <StatusBadge value={d.status} />
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-500">
                  {fmtDate(d.created_at)} {fmtTime(d.created_at)}
                </Td>
                <Td className="text-right">
                  <Link href={`/operator/trips/${trip.id}`} className="font-semibold text-brand-600 hover:text-brand-700">
                    Resolve →
                  </Link>
                </Td>
              </tr>
            );
          })}
        </TableShell>
      </DataView>
    </>
  );
}
