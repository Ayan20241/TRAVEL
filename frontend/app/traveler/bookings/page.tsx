"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Booking, type Trip } from "@/lib/client-api";
import { Button, Card, Badge, Spinner, EmptyState, ErrorState, PageHeader, fmtMoney, fmtDate } from "@/components/ui";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = async () => {
    setError("");
    try {
      const [b, t] = await Promise.all([
        api<Booking[]>("/api/v1/bookings"),
        api<Trip[]>("/api/v1/trips").catch(() => [] as Trip[]),
      ]);
      setBookings(b);
      setTrips(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);

  const cancel = async (b: Booking) => {
    if (!window.confirm(`Cancel booking “${b.service_name}”? This cannot be undone.`)) return;
    setCancelling(b.id);
    try {
      await api(`/api/v1/bookings/${b.id}`, { method: "PATCH", body: { status: "CANCELLED" } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel booking.");
    } finally {
      setCancelling(null);
    }
  };

  if (error && !loaded) return <ErrorState message={error} onRetry={load} />;
  if (!loaded) return <Spinner />;

  const tripName = (tid: string) => trips.find((t) => t.id === tid)?.title || "Trip";

  return (
    <div>
      <PageHeader title="My bookings" subtitle="Every booking across all your trips." />
      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          hint="Bookings appear here once your trips move to the booked stage."
          action={<Link href="/traveler/trips/new"><Button>Plan a trip</Button></Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bookings.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-ink-900">{b.service_name}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {b.service_type}
                    {b.reference_code && ` · ref ${b.reference_code}`}
                  </p>
                  <Link href={`/traveler/trips/${b.trip_id}`} className="mt-1 block text-sm font-medium text-brand-600 hover:underline">
                    {tripName(b.trip_id)}
                  </Link>
                  <p className="mt-2 text-lg font-bold text-ink-900">
                    {b.amount != null ? fmtMoney(b.amount, b.currency) : "—"}
                  </p>
                  {b.booked_at && <p className="text-xs text-ink-500">Booked {fmtDate(b.booked_at)}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge value={b.status} />
                  {!["CANCELLED", "COMPLETED"].includes(b.status) && (
                    <button
                      onClick={() => cancel(b)}
                      disabled={cancelling === b.id}
                      className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancelling === b.id ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
