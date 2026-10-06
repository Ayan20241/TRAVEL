"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Trip, type ItineraryItem, type Disruption, type Pricing, type NotificationItem } from "@/lib/client-api";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Badge, Spinner, EmptyState, ErrorState, PageHeader, fmtMoney, fmtDate, fmtTime } from "@/components/ui";

type Loaded = {
  trips: Trip[];
  notifications: NotificationItem[];
  focusItems: ItineraryItem[];
  focusDisruptions: Disruption[];
  pricing: Pricing | null;
};

function isActive(t: Trip) {
  return ["IN_PROGRESS", "DISRUPTED", "BOOKED", "READY"].includes(t.status);
}

export default function TravelerDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    setData(null);
    try {
      const [trips, notifications] = await Promise.all([
        api<Trip[]>("/api/v1/trips"),
        api<NotificationItem[]>("/api/v1/notifications?unread_only=true"),
      ]);
      let focusItems: ItineraryItem[] = [];
      let focusDisruptions: Disruption[] = [];
      let pricing: Pricing | null = null;
      const now = new Date();
      const focus =
        trips.find((t) => t.status === "IN_PROGRESS" || t.status === "DISRUPTED") ||
        trips
          .filter((t) => new Date(t.start_date) >= new Date(now.toDateString()) && t.status !== "CANCELLED")
          .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      if (focus) {
        const [items, disruptions, p] = await Promise.all([
          api<ItineraryItem[]>(`/api/v1/trips/${focus.id}/itinerary`),
          api<Disruption[]>(`/api/v1/trips/${focus.id}/disruptions`),
          api<Pricing>(`/api/v1/trips/${focus.id}/pricing`).catch(() => null),
        ]);
        focusItems = items;
        focusDisruptions = disruptions;
        pricing = p;
      }
      setData({ trips, notifications, focusItems, focusDisruptions, pricing });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const now = new Date();
  const active = data.trips.filter(isActive);
  const upcoming = data.trips
    .filter((t) => new Date(t.start_date) >= new Date(now.toDateString()) && !isActive(t))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const focus =
    active.find((t) => t.status === "IN_PROGRESS" || t.status === "DISRUPTED") ||
    upcoming[0] ||
    data.trips[0] ||
    null;

  const nextActivity = focus
    ? data.focusItems
        .filter((i) => new Date(i.start_time) >= now && !["CANCELLED", "COMPLETED"].includes(i.status))
        .sort((a, b) => a.start_time.localeCompare(b.start_time))[0]
    : null;

  const openDisruptions = data.focusDisruptions.filter((d) => d.status === "OPEN");

  return (
    <div>
      <PageHeader
        title={`Namaste${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋`}
        subtitle="Your trips, budget, and alerts — all in one place."
        action={
          <Link href="/traveler/trips/new">
            <Button>✈️ Plan new trip</Button>
          </Link>
        }
      />

      {/* Alert strip */}
      {openDisruptions.length > 0 && focus && (
        <Link href={`/traveler/trips/${focus.id}`}>
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-red-800">
                {openDisruptions.length} open disruption{openDisruptions.length > 1 ? "s" : ""} on “{focus.title}”
              </p>
              <p className="text-sm text-red-600">Tap to analyze impact and choose a recovery option →</p>
            </div>
          </div>
        </Link>
      )}

      {data.trips.length === 0 ? (
        <EmptyState
          title="No trips yet"
          hint="Create your first trip and let TourFlow AI personalize it for you."
          action={
            <Link href="/traveler/trips/new">
              <Button>Plan your first trip</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Current / next trip */}
          <Card className="lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {focus?.status === "IN_PROGRESS" || focus?.status === "DISRUPTED" ? "Current trip" : "Next trip"}
                </p>
                {focus && (
                  <>
                    <h2 className="mt-1 text-xl font-bold text-ink-900">{focus.title}</h2>
                    <p className="text-sm text-ink-500">
                      {focus.destination} · {fmtDate(focus.start_date)} → {fmtDate(focus.end_date)}
                    </p>
                  </>
                )}
              </div>
              {focus && <Badge value={focus.status} />}
            </div>
            {focus && data.pricing && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-ink-500">Budget</p>
                  <p className="text-lg font-bold text-ink-900">{fmtMoney(focus.budget, focus.currency)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-ink-500">Estimated</p>
                  <p className="text-lg font-bold text-ink-900">{fmtMoney(data.pricing.estimated_total, data.pricing.currency)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-ink-500">Status</p>
                  <p className={`text-lg font-bold ${data.pricing.within_budget === false ? "text-red-600" : "text-emerald-600"}`}>
                    {data.pricing.within_budget === false ? "Over budget" : "On track"}
                  </p>
                </div>
              </div>
            )}
            {focus && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/traveler/trips/${focus.id}`}><Button>Open trip</Button></Link>
                <Link href={`/traveler/trips/${focus.id}/itinerary`}>
                  <Button className="bg-white text-brand-700 border border-brand-200 hover:bg-brand-50">Edit itinerary</Button>
                </Link>
                <Link href={`/traveler/trips/${focus.id}/budget`}>
                  <Button className="bg-white text-brand-700 border border-brand-200 hover:bg-brand-50">View budget</Button>
                </Link>
              </div>
            )}
          </Card>

          {/* Next activity */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Next activity</p>
            {nextActivity ? (
              <div className="mt-3">
                <p className="font-bold text-ink-900">{nextActivity.title}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {fmtDate(nextActivity.start_time)} · {fmtTime(nextActivity.start_time)} – {fmtTime(nextActivity.end_time)}
                </p>
                {nextActivity.location && <p className="text-sm text-ink-500">📍 {nextActivity.location}</p>}
                <div className="mt-2"><Badge value={nextActivity.status} /></div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-500">Nothing scheduled next. Enjoy the moment!</p>
            )}
          </Card>
        </div>
      )}

      {/* Trips + alerts */}
      {data.trips.length > 0 && (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-lg font-bold text-ink-900">Upcoming trips</h2>
            <div className="space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-ink-500">No upcoming trips.</p>}
              {upcoming.map((t) => (
                <Link key={t.id} href={`/traveler/trips/${t.id}`}>
                  <Card className="transition hover:shadow-md">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-ink-900">{t.title}</p>
                        <p className="text-sm text-ink-500">
                          {t.destination} · {fmtDate(t.start_date)} → {fmtDate(t.end_date)} · {fmtMoney(t.budget, t.currency)}
                        </p>
                      </div>
                      <Badge value={t.status} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            {active.length > 0 && (
              <>
                <h2 className="mb-3 mt-8 text-lg font-bold text-ink-900">Active trips</h2>
                <div className="space-y-3">
                  {active.map((t) => (
                    <Link key={t.id} href={`/traveler/trips/${t.id}`}>
                      <Card className="transition hover:shadow-md">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-ink-900">{t.title}</p>
                            <p className="text-sm text-ink-500">
                              {t.destination} · {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                            </p>
                          </div>
                          <Badge value={t.status} />
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <h2 className="mb-3 text-lg font-bold text-ink-900">Recent alerts</h2>
            {data.notifications.length === 0 ? (
              <Card><p className="text-sm text-ink-500">No new alerts. All quiet on the travel front. ✈️</p></Card>
            ) : (
              <div className="space-y-3">
                {data.notifications.slice(0, 8).map((n) => (
                  <Card key={n.id} className="!p-4">
                    <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                    {n.body && <p className="mt-1 text-sm text-ink-500">{n.body}</p>}
                    <p className="mt-1 text-xs text-ink-500">{fmtDate(n.created_at)}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
