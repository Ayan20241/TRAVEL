"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  api, type Trip, type ItineraryItem, type Disruption, type RecoveryOption,
  type Impact, type Booking, type Pricing, type Review,
} from "@/lib/client-api";
import {
  Button, GhostButton, Card, Input, Label, Badge, Spinner, EmptyState, ErrorState,
  PageHeader, fmtMoney, fmtDate, fmtTime,
} from "@/components/ui";
import { PricingRows } from "@/components/PricingRows";

const TYPE_ICONS: Record<string, string> = {
  FLIGHT: "✈️", TRAIN: "🚂", BUS: "🚌", TRANSFER: "🚕", HOTEL: "🏨",
  ACTIVITY: "🎯", EVENT: "🎪", RESTAURANT: "🍽️", OTHER: "📌",
};

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"itinerary" | "recovery" | "bookings" | "pricing" | "ask" | "reviews">("itinerary");

  // Disruption workspace state
  const [activeDisruption, setActiveDisruption] = useState<string | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [options, setOptions] = useState<RecoveryOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Ask AI state
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  // Review state
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = async () => {
    setError("");
    try {
      const [t, it, d, b, p, r] = await Promise.all([
        api<Trip>(`/api/v1/trips/${id}`),
        api<ItineraryItem[]>(`/api/v1/trips/${id}/itinerary`),
        api<Disruption[]>(`/api/v1/trips/${id}/disruptions`),
        api<Booking[]>(`/api/v1/trips/${id}/bookings`).catch(() => [] as Booking[]),
        api<Pricing>(`/api/v1/trips/${id}/pricing`).catch(() => null),
        api<Review[]>(`/api/v1/trips/${id}/reviews`).catch(() => [] as Review[]),
      ]);
      setTrip(t); setItems(it); setDisruptions(d); setBookings(b); setPricing(p); setReviews(r);
      const open = d.find((x) => x.status === "OPEN");
      if (open) { setActiveDisruption(open.id); setTab("recovery"); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trip.");
    }
  };

  useEffect(() => { load(); }, [id]);

  const runImpact = async (disruptionId: string) => {
    setImpactLoading(true);
    setImpact(null);
    try {
      const res = await api<Impact>(`/api/v1/disruptions/${disruptionId}/impact`, { method: "POST" });
      setImpact(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impact analysis failed.");
    } finally {
      setImpactLoading(false);
    }
  };

  const loadOptions = async (disruptionId: string, generate: boolean) => {
    setOptionsLoading(true);
    try {
      const url = `/api/v1/disruptions/${disruptionId}/recovery-options`;
      const res = await api<RecoveryOption[]>(url, generate ? { method: "POST" } : {});
      setOptions(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recovery options.");
    } finally {
      setOptionsLoading(false);
    }
  };

  const acceptOption = async (opt: RecoveryOption) => {
    if (!window.confirm(`Accept “${opt.title}”? Your itinerary will be updated and the change audited.`)) return;
    setSelecting(opt.id);
    try {
      await api(`/api/v1/recovery-options/${opt.id}/select`, { method: "POST" });
      await load();
      setImpact(null);
      setOptions([]);
      setActiveDisruption(null);
      setTab("itinerary");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply recovery option.");
    } finally {
      setSelecting(null);
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setAskLoading(true);
    setAnswer("");
    try {
      const raw = await api<unknown>(`/api/v1/trips/${id}/ask`, { method: "POST", body: { question: question.trim() } });
      const r = raw as Record<string, unknown>;
      setAnswer(typeof r.answer === "string" ? r.answer : typeof r.response === "string" ? r.response : JSON.stringify(raw, null, 2));
    } catch (e) {
      setAnswer(`Error: ${e instanceof Error ? e.message : "AI request failed."}`);
    } finally {
      setAskLoading(false);
    }
  };

  const submitReview = async () => {
    setReviewBusy(true);
    try {
      const r = await api<Review>(`/api/v1/trips/${id}/reviews`, { method: "POST", body: { rating, comment: comment || null } });
      setReviews((prev) => [r, ...prev]);
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit review.");
    } finally {
      setReviewBusy(false);
    }
  };

  if (error && !trip) return <ErrorState message={error} onRetry={load} />;
  if (!trip) return <Spinner />;

  const openDisruptions = disruptions.filter((d) => d.status === "OPEN");
  const itemsByDay = items
    .slice()
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .reduce<Record<string, ItineraryItem[]>>((acc, it) => {
      const k = dayKey(it.start_time);
      (acc[k] = acc[k] || []).push(it);
      return acc;
    }, {});
  const itemName = (iid: string) => items.find((i) => i.id === iid)?.title || iid.slice(0, 8);
  const sortedOptions = options.slice().sort((a, b) => (a.ai_rank ?? 999) - (b.ai_rank ?? 999));

  const tabs = [
    { k: "itinerary", label: "Itinerary" },
    { k: "recovery", label: `Disruptions${openDisruptions.length ? ` (${openDisruptions.length})` : ""}` },
    { k: "bookings", label: "Bookings" },
    { k: "pricing", label: "Pricing" },
    { k: "ask", label: "Ask AI" },
    { k: "reviews", label: "Reviews" },
  ] as const;

  return (
    <div>
      <Link href="/traveler" className="text-sm font-medium text-brand-600 hover:underline">← All trips</Link>
      <PageHeader
        title={trip.title}
        subtitle={`${trip.destination} · ${fmtDate(trip.start_date)} → ${fmtDate(trip.end_date)} · ${trip.duration_days} days`}
        action={<Badge value={trip.status} />}
      />

      {/* Disruption banner */}
      {openDisruptions.length > 0 && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-bold text-red-800">⚠️ {openDisruptions.length} open disruption{openDisruptions.length > 1 ? "s" : ""} — your trip needs attention</p>
          <div className="mt-2 space-y-1">
            {openDisruptions.map((d) => (
              <p key={d.id} className="text-sm text-red-700">
                {d.type.replace(/_/g, " ")} · {d.delay_minutes} min delay{d.reason ? ` · ${d.reason}` : ""}
              </p>
            ))}
          </div>
          <Button className="mt-3 !bg-red-600 hover:!bg-red-700" onClick={() => setTab("recovery")}>
            Analyze & recover →
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.k ? "bg-ink-900 text-white" : "bg-white text-ink-700 border border-slate-200 hover:bg-slate-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ITINERARY TAB */}
      {tab === "itinerary" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink-900">Day-by-day itinerary</h2>
            <Link href={`/traveler/trips/${id}/itinerary`}><Button>Edit itinerary</Button></Link>
          </div>
          {items.length === 0 ? (
            <EmptyState title="No itinerary items yet" hint="Add flights, stays, and activities to build your day-by-day plan." action={<Link href={`/traveler/trips/${id}/itinerary`}><Button>Add items</Button></Link>} />
          ) : (
            Object.entries(itemsByDay).map(([day, dayItems]) => (
              <div key={day} className="mb-6">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">
                  {fmtDate(day)} — Day {Math.round((new Date(day).getTime() - new Date(trip.start_date).getTime()) / 86400000) + 1}
                </h3>
                <div className="space-y-2">
                  {dayItems.map((it) => (
                    <Card key={it.id} className="!p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <span className="text-2xl">{TYPE_ICONS[it.type] || "📌"}</span>
                          <div>
                            <p className="font-bold text-ink-900">{it.title}</p>
                            <p className="text-sm text-ink-500">
                              {fmtTime(it.start_time)} – {fmtTime(it.end_time)}
                              {it.location && ` · 📍 ${it.location}`}
                            </p>
                            {it.description && <p className="mt-1 text-sm text-ink-500">{it.description}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge value={it.status} />
                          {it.cost != null && <span className="text-sm font-semibold text-ink-700">{fmtMoney(it.cost, it.currency)}</span>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* RECOVERY TAB */}
      {tab === "recovery" && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Disruptions & recovery</h2>
          {disruptions.length === 0 ? (
            <EmptyState title="No disruptions" hint="Your trip is running smoothly. If something changes, it'll show up here." />
          ) : (
            <div className="space-y-4">
              {disruptions.map((d) => (
                <Card key={d.id} className={d.status === "OPEN" ? "!border-red-200" : ""}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink-900">{d.type.replace(/_/g, " ")}</p>
                      <p className="text-sm text-ink-500">
                        {d.delay_minutes} min · source: {d.source_item_id ? itemName(d.source_item_id) : "—"}
                        {d.reason && ` · ${d.reason}`} · {fmtDate(d.created_at)}
                      </p>
                    </div>
                    <Badge value={d.status} />
                  </div>
                  {d.status === "OPEN" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => { setActiveDisruption(d.id); runImpact(d.id); }}>Analyze impact</Button>
                      <GhostButton onClick={() => { setActiveDisruption(d.id); loadOptions(d.id, false); }}>View recovery options</GhostButton>
                      <GhostButton onClick={() => { setActiveDisruption(d.id); loadOptions(d.id, true); }}>✨ Generate recovery options</GhostButton>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Impact result */}
          {impactLoading && <Spinner />}
          {impact && activeDisruption && (
            <Card className="mt-5">
              <h3 className="text-lg font-bold text-ink-900">Impact analysis</h3>
              <p className="mt-1 text-sm text-ink-500">{impact.explanation}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-700">Feasibility:</span>
                <Badge value={impact.feasible ? "CONFIRMED" : "BROKEN"} />
                <span className="text-xs text-ink-500">{impact.feasible ? "itinerary still workable" : "itinerary has broken items"}</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {Object.entries(impact.affected_items).map(([iid, state]) => (
                  <div key={iid} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="text-sm font-medium text-ink-900">{itemName(iid)}</span>
                    <Badge value={state} />
                  </div>
                ))}
              </div>
              {impact.violations.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-red-700">Violations</p>
                  <pre className="mt-1 overflow-auto rounded-xl bg-red-50 p-3 text-xs text-red-800">{JSON.stringify(impact.violations, null, 2)}</pre>
                </div>
              )}
              {impact.warnings.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-amber-700">Warnings</p>
                  <pre className="mt-1 overflow-auto rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{JSON.stringify(impact.warnings, null, 2)}</pre>
                </div>
              )}
            </Card>
          )}

          {/* Recovery options */}
          {optionsLoading && <Spinner />}
          {options.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-lg font-bold text-ink-900">Recovery options <span className="text-sm font-normal text-ink-500">(AI-ranked, engine-validated)</span></h3>
              <div className="space-y-3">
                {sortedOptions.map((o, idx) => (
                  <Card key={o.id} className={o.selected ? "!border-emerald-300 bg-emerald-50/40" : ""}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {o.ai_rank != null && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">#{idx + 1}</span>}
                          <p className="font-bold text-ink-900">{o.title}</p>
                          <Badge value={o.action} />
                          {!o.feasibility && <Badge value="BROKEN" />}
                          {o.selected && <Badge value="CONFIRMED" />}
                        </div>
                        {o.description && <p className="mt-1 text-sm text-ink-500">{o.description}</p>}
                        {o.ai_reason && <p className="mt-1 text-sm italic text-brand-700">✨ {o.ai_reason}</p>}
                        <div className="mt-2 flex flex-wrap gap-4 text-sm">
                          <span className={o.estimated_cost_delta > 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                            Cost Δ {o.estimated_cost_delta >= 0 ? "+" : ""}{fmtMoney(o.estimated_cost_delta)}
                          </span>
                          {o.experience_impact && <span className="text-ink-500">Experience: {o.experience_impact}</span>}
                        </div>
                        {o.affected_items.length > 0 && (
                          <p className="mt-1 text-xs text-ink-500">Affects: {o.affected_items.map(itemName).join(", ")}</p>
                        )}
                      </div>
                      {!o.selected && (
                        <Button onClick={() => acceptOption(o)} disabled={selecting === o.id}>
                          {selecting === o.id ? "Applying…" : "Accept"}
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOOKINGS TAB */}
      {tab === "bookings" && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Bookings</h2>
          {bookings.length === 0 ? (
            <EmptyState title="No bookings yet" hint="Bookings linked to this trip will appear here." />
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <Card key={b.id} className="!p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink-900">{b.service_name}</p>
                      <p className="text-sm text-ink-500">
                        {b.service_type}{b.reference_code && ` · ref ${b.reference_code}`} · {b.amount != null ? fmtMoney(b.amount, b.currency) : "—"}
                      </p>
                    </div>
                    <Badge value={b.status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PRICING TAB */}
      {tab === "pricing" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink-900">Pricing</h2>
            <Link href={`/traveler/trips/${id}/budget`}><Button>Full budget view</Button></Link>
          </div>
          {!pricing ? (
            <Card><p className="text-sm text-ink-500">Pricing is unavailable right now.</p></Card>
          ) : (
            <Card>
              <PricingRows pricing={pricing} />
            </Card>
          )}
        </div>
      )}

      {/* ASK AI TAB */}
      {tab === "ask" && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Ask AI about this trip</h2>
          <Card>
            <div className="flex gap-2">
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Can I fit a museum visit on day 3?" onKeyDown={(e) => e.key === "Enter" && ask()} />
              <Button onClick={ask} disabled={askLoading || !question.trim()}>{askLoading ? "…" : "Ask"}</Button>
            </div>
            {answer && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-ink-700 whitespace-pre-wrap">{answer}</div>
            )}
          </Card>
        </div>
      )}

      {/* REVIEWS TAB */}
      {tab === "reviews" && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Trip reviews</h2>
          {trip.status === "COMPLETED" && (
            <Card className="mb-4">
              <h3 className="font-bold text-ink-900">How was your trip?</h3>
              <div className="mt-3 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} className={`text-3xl ${n <= rating ? "opacity-100" : "opacity-30"}`} aria-label={`${n} stars`}>
                    ⭐
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Label>Comment (optional)</Label>
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell future travelers what you loved…" />
              </div>
              <Button className="mt-3" onClick={submitReview} disabled={reviewBusy}>{reviewBusy ? "Submitting…" : "Submit review"}</Button>
            </Card>
          )}
          {reviews.length === 0 ? (
            <EmptyState title="No reviews yet" hint={trip.status === "COMPLETED" ? "Be the first to review this trip." : "Reviews unlock after the trip is completed."} />
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r.id} className="!p-4">
                  <p className="font-bold text-ink-900">{"⭐".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                  {r.comment && <p className="mt-1 text-sm text-ink-700">{r.comment}</p>}
                  <p className="mt-1 text-xs text-ink-500">{fmtDate(r.created_at)}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
