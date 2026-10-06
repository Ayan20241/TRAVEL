"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api, type Trip, type Destination, type Recommendation,
} from "@/lib/client-api";
import { Button, GhostButton, Card, Input, Select, Label, Badge, Spinner, ErrorState, PageHeader, fmtMoney } from "@/components/ui";

const INTERESTS = ["History", "Food", "Museums", "Photography", "Adventure", "Beach", "Nature", "Nightlife", "Shopping", "Wellness", "Architecture", "Wildlife"];
const TRANSPORT = ["Flight", "Train", "Bus", "Cab", "Rental car", "Self-drive"];
const ACCOMMODATION = ["Hotel", "Resort", "Homestay", "Hostel", "Apartment", "Villa"];
const STYLES = ["Relaxed", "Balanced", "Packed", "Luxury", "Backpacking", "Family", "Adventure"];
const PACES = ["Relaxed", "Balanced", "Packed"];

type Wizard = {
  destination: string; title: string; start_date: string; end_date: string;
  budget: string; currency: string; accommodation: string; transportation: string[];
  interests: string[]; pace: string; travel_style: string; notes: string;
};

const initial: Wizard = {
  destination: "", title: "", start_date: "", end_date: "",
  budget: "", currency: "INR", accommodation: "Hotel", transportation: [],
  interests: [], pace: "Balanced", travel_style: "Balanced", notes: "",
};

type Suggestion = {
  type: string; title: string; description: string | null; location: string | null;
  start_time: string; end_time: string; cost: number | null; selected: boolean;
};

const ITEM_TYPES = ["FLIGHT", "TRAIN", "BUS", "TRANSFER", "HOTEL", "ACTIVITY", "EVENT", "RESTAURANT", "OTHER"];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-slate-200 bg-white text-ink-700 hover:border-brand-300"
      }`}
    >
      {label}
    </button>
  );
}

function normalizeSuggestions(raw: unknown, tripStart: string): Suggestion[] {
  const r = raw as Record<string, unknown> | unknown[];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (r && typeof r === "object") {
    for (const k of ["items", "suggestions", "itinerary", "days"]) {
      const v = (r as Record<string, unknown>)[k];
      if (Array.isArray(v)) {
        arr = k === "days" ? (v as Record<string, unknown>[]).flatMap((d) => (Array.isArray(d.items) ? d.items : [])) : v;
        break;
      }
    }
  }
  const base = new Date(tripStart + "T09:00:00");
  return arr.slice(0, 40).map((x, i) => {
    const o = (x || {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const type = typeof o.type === "string" && ITEM_TYPES.includes(o.type) ? o.type : "OTHER";
    const dayOff = Math.floor(i / 3);
    const slot = (i % 3) * 3;
    const s = new Date(base);
    s.setDate(s.getDate() + dayOff);
    s.setHours(s.getHours() + slot);
    const e = new Date(s);
    e.setHours(e.getHours() + 2);
    return {
      type,
      title: str(o.title) || `Suggested activity ${i + 1}`,
      description: str(o.description),
      location: str(o.location),
      start_time: str(o.start_time) || s.toISOString(),
      end_time: str(o.end_time) || e.toISOString(),
      cost: typeof o.cost === "number" ? o.cost : typeof o.estimated_cost === "number" ? o.estimated_cost : null,
      selected: true,
    };
  });
}

export default function NewTripWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [w, setW] = useState<Wizard>(initial);
  const [phase, setPhase] = useState<"wizard" | "creating" | "recommendations" | "suggestions" | "finalize">("wizard");
  const [error, setError] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destLoading, setDestLoading] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Wizard>(k: K, v: Wizard[K]) => setW((p) => ({ ...p, [k]: v }));
  const toggle = (k: "transportation" | "interests", v: string) =>
    setW((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  const searchDestinations = async () => {
    setDestLoading(true);
    try {
      const q = destQuery.trim();
      const list = await api<Destination[]>(`/api/v1/destinations${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setDestinations(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Destination search failed.");
    } finally {
      setDestLoading(false);
    }
  };

  const canNext = () => {
    switch (step) {
      case 0: return w.destination.trim().length >= 2;
      case 1: return !!w.start_date && !!w.end_date && w.end_date >= w.start_date;
      case 2: return w.budget === "" || Number(w.budget) > 0;
      default: return true;
    }
  };

  const createTrip = async () => {
    setPhase("creating");
    setError("");
    try {
      const created = await api<Trip>("/api/v1/trips", {
        method: "POST",
        body: {
          title: w.title.trim() || `Trip to ${w.destination}`,
          destination: w.destination.trim(),
          start_date: w.start_date,
          end_date: w.end_date,
          budget: w.budget ? Number(w.budget) : null,
          currency: w.currency,
          travel_style: w.travel_style,
        },
      });
      await api(`/api/v1/trips/${created.id}/preferences`, {
        method: "PUT",
        body: {
          budget: w.budget ? Number(w.budget) : null,
          accommodation_preference: w.accommodation,
          transportation_preference: w.transportation.join(", ") || null,
          interests: w.interests,
          activity_preferences: w.interests,
          pace: w.pace,
          travel_style: w.travel_style,
          notes: w.notes || null,
        },
      });
      await api(`/api/v1/trips/${created.id}`, { method: "PATCH", body: { status: "PLANNING" } });
      setTrip(created);
      setPhase("recommendations");
      setRecsLoading(true);
      try {
        const r = await api<Recommendation[]>(`/api/v1/trips/${created.id}/recommendations`);
        setRecs(r);
      } catch {
        setRecs([]);
      } finally {
        setRecsLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create trip.");
      setPhase("wizard");
    }
  };

  const generateSuggestions = async () => {
    if (!trip) return;
    setSugLoading(true);
    setError("");
    try {
      const raw = await api<unknown>(`/api/v1/trips/${trip.id}/itinerary-suggestion`);
      setSuggestions(normalizeSuggestions(raw, trip.start_date));
      setPhase("suggestions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate itinerary suggestions.");
    } finally {
      setSugLoading(false);
    }
  };

  const addSelected = async () => {
    if (!trip) return;
    setBusy(true);
    setError("");
    try {
      const chosen = suggestions.filter((s) => s.selected);
      for (const s of chosen) {
        await api(`/api/v1/trips/${trip.id}/itinerary`, {
          method: "POST",
          body: {
            type: s.type, title: s.title, description: s.description, location: s.location,
            start_time: s.start_time, end_time: s.end_time, cost: s.cost,
          },
        });
      }
      await api(`/api/v1/trips/${trip.id}`, { method: "PATCH", body: { status: "READY" } });
      setPhase("finalize");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add itinerary items.");
    } finally {
      setBusy(false);
    }
  };

  const bookTrip = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      await api(`/api/v1/trips/${trip.id}`, { method: "PATCH", body: { status: "BOOKED" } });
      router.push(`/traveler/trips/${trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not book trip.");
      setBusy(false);
    }
  };

  const stepTitles = ["Destination", "Dates", "Budget", "Stay", "Getting around", "Interests", "Travel style", "Review"];

  if (phase === "creating") {
    return (
      <div className="mx-auto max-w-2xl">
        <Spinner />
        <p className="text-center text-sm text-ink-500">Creating your trip and saving preferences…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Plan a new trip" subtitle="A guided journey — no boring forms." />

      {/* Progress */}
      {phase === "wizard" && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {stepTitles.map((t, i) => (
            <span key={t} className={`rounded-full px-3 py-1 text-xs font-semibold ${i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-ink-500"}`}>
              {i + 1}. {t}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {phase === "wizard" && (
        <Card>
          {/* Step 0: Destination */}
          {step === 0 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">Where to?</h2>
              <p className="mt-1 text-sm text-ink-500">Search our destination catalog or type anywhere on Earth.</p>
              <div className="mt-4 flex gap-2">
                <Input value={destQuery} onChange={(e) => setDestQuery(e.target.value)} placeholder="Search destinations… e.g. Paris" onKeyDown={(e) => e.key === "Enter" && searchDestinations()} />
                <Button onClick={searchDestinations} disabled={destLoading}>Search</Button>
              </div>
              {destLoading && <Spinner />}
              {destinations.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {destinations.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => set("destination", d.name)}
                      className={`rounded-2xl border p-4 text-left transition ${w.destination === d.name ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-300"}`}
                    >
                      <p className="font-bold text-ink-900">{d.name}</p>
                      <p className="text-xs text-ink-500">{d.country}</p>
                      {d.description && <p className="mt-1 line-clamp-2 text-sm text-ink-500">{d.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {d.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-500">{t}</span>
                        ))}
                      </div>
                      {d.avg_daily_cost != null && (
                        <p className="mt-2 text-xs font-semibold text-ink-700">~{fmtMoney(d.avg_daily_cost, d.currency)} / day</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Label>Your destination</Label>
                <Input value={w.destination} onChange={(e) => set("destination", e.target.value)} placeholder="e.g. Paris, Goa, Kyoto…" />
              </div>
            </div>
          )}

          {/* Step 1: Dates */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">When are you traveling?</h2>
              <div className="mt-4">
                <Label>Trip title</Label>
                <Input value={w.title} onChange={(e) => set("title", e.target.value)} placeholder={`Trip to ${w.destination || "…"}`} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Start date</Label>
                  <Input type="date" value={w.start_date} onChange={(e) => set("start_date", e.target.value)} />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input type="date" value={w.end_date} min={w.start_date} onChange={(e) => set("end_date", e.target.value)} />
                </div>
              </div>
              {w.start_date && w.end_date && w.end_date >= w.start_date && (
                <p className="mt-3 text-sm text-ink-500">
                  {Math.round((new Date(w.end_date).getTime() - new Date(w.start_date).getTime()) / 86400000) + 1} days of adventure 🎉
                </p>
              )}
            </div>
          )}

          {/* Step 2: Budget */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">What’s your budget?</h2>
              <p className="mt-1 text-sm text-ink-500">We’ll keep recommendations realistic for this number.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Total budget</Label>
                  <Input type="number" min={0} value={w.budget} onChange={(e) => set("budget", e.target.value)} placeholder="150000" />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={w.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="INR">INR ₹</option>
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Accommodation */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">Where do you want to stay?</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {ACCOMMODATION.map((a) => (
                  <Chip key={a} label={a} active={w.accommodation === a} onClick={() => set("accommodation", a)} />
                ))}
              </div>
              <div className="mt-5">
                <Label>Daily pace</Label>
                <div className="flex gap-2">
                  {PACES.map((p) => (
                    <Chip key={p} label={p} active={w.pace === p} onClick={() => set("pace", p)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Transportation */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">How do you like to get around?</h2>
              <p className="mt-1 text-sm text-ink-500">Pick all that apply.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {TRANSPORT.map((t) => (
                  <Chip key={t} label={t} active={w.transportation.includes(t)} onClick={() => toggle("transportation", t)} />
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Interests */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">What do you love?</h2>
              <p className="mt-1 text-sm text-ink-500">This shapes your AI recommendations.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {INTERESTS.map((i) => (
                  <Chip key={i} label={i} active={w.interests.includes(i)} onClick={() => toggle("interests", i)} />
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Travel style */}
          {step === 6 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">Your travel style</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <Chip key={s} label={s} active={w.travel_style === s} onClick={() => set("travel_style", s)} />
                ))}
              </div>
              <div className="mt-5">
                <Label>Anything else we should know? (optional)</Label>
                <Input value={w.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Vegetarian food, wheelchair access, celebrating an anniversary…" />
              </div>
            </div>
          )}

          {/* Step 7: Review */}
          {step === 7 && (
            <div>
              <h2 className="text-xl font-bold text-ink-900">Review your trip</h2>
              <div className="mt-4 space-y-2 text-sm">
                <ReviewRow label="Destination" value={w.destination} />
                <ReviewRow label="Dates" value={`${w.start_date} → ${w.end_date}`} />
                <ReviewRow label="Budget" value={w.budget ? fmtMoney(Number(w.budget), w.currency) : "Not set"} />
                <ReviewRow label="Stay" value={w.accommodation} />
                <ReviewRow label="Getting around" value={w.transportation.join(", ") || "—"} />
                <ReviewRow label="Interests" value={w.interests.join(", ") || "—"} />
                <ReviewRow label="Style" value={`${w.travel_style} · ${w.pace} pace`} />
              </div>
              <p className="mt-4 text-sm text-ink-500">Creating this trip will save your preferences and ask the AI for personalized recommendations.</p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between">
            <GhostButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              ← Back
            </GhostButton>
            {step < 7 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
                Continue →
              </Button>
            ) : (
              <Button onClick={createTrip}>Create trip & get recommendations ✨</Button>
            )}
          </div>
        </Card>
      )}

      {/* Recommendations phase */}
      {phase === "recommendations" && trip && (
        <div>
          <Card className="mb-5 border-brand-200 bg-brand-50">
            <h2 className="text-lg font-bold text-ink-900">🎉 “{trip.title}” is ready for planning</h2>
            <p className="mt-1 text-sm text-ink-500">Here’s what our AI suggests for {trip.destination}, based on your preferences.</p>
          </Card>
          {recsLoading ? (
            <Spinner />
          ) : recs.length === 0 ? (
            <Card><p className="text-sm text-ink-500">No recommendations came back this time — you can still build your itinerary manually.</p></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {recs.map((r, i) => (
                <Card key={i}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-ink-900">{r.title}</h3>
                    {r.category && <Badge value={r.category.toUpperCase().replace(/\s+/g, "_").slice(0, 20)} />}
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{r.description}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink-700">{r.estimated_cost != null ? fmtMoney(r.estimated_cost) : "Price varies"}</span>
                    {r.score > 0 && <span className="text-xs text-ink-500">match {(r.score * 100).toFixed(0)}%</span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={generateSuggestions} disabled={sugLoading}>
              {sugLoading ? "Generating…" : "✨ Generate day-by-day itinerary"}
            </Button>
            <Link href={`/traveler/trips/${trip.id}`}>
              <GhostButton>Skip — build it myself</GhostButton>
            </Link>
          </div>
        </div>
      )}

      {/* Suggestions phase */}
      {phase === "suggestions" && trip && (
        <div>
          <PageHeader title="Your AI itinerary draft" subtitle="Tick the items you like, then add them to your trip." />
          {suggestions.length === 0 ? (
            <Card><p className="text-sm text-ink-500">No suggestions were returned. You can build the itinerary manually instead.</p></Card>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <label key={i} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${s.selected ? "border-brand-300 bg-brand-50/50" : "border-slate-200 bg-white"}`}>
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={() => setSuggestions((prev) => prev.map((x, j) => (j === i ? { ...x, selected: !x.selected } : x)))}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge value={s.type} />
                      <p className="font-bold text-ink-900">{s.title}</p>
                    </div>
                    {s.description && <p className="mt-1 text-sm text-ink-500">{s.description}</p>}
                    <p className="mt-1 text-xs text-ink-500">
                      {new Date(s.start_time).toLocaleString("en-IN")} → {new Date(s.end_time).toLocaleString("en-IN")}
                      {s.location && ` · 📍 ${s.location}`}
                    </p>
                  </div>
                  {s.cost != null && <p className="text-sm font-semibold text-ink-700">{fmtMoney(s.cost)}</p>}
                </label>
              ))}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={addSelected} disabled={busy || suggestions.every((s) => !s.selected)}>
              {busy ? "Adding…" : `Add ${suggestions.filter((s) => s.selected).length} items to my trip`}
            </Button>
            <Link href={`/traveler/trips/${trip.id}`}><GhostButton>Skip for now</GhostButton></Link>
          </div>
        </div>
      )}

      {/* Finalize phase */}
      {phase === "finalize" && trip && (
        <Card className="text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="mt-3 text-2xl font-bold text-ink-900">Your itinerary is ready!</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
            Your trip is marked <Badge value="READY" />. Confirm the booking to lock it in, or fine-tune the itinerary first.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={bookTrip} disabled={busy}>{busy ? "Booking…" : "Confirm booking 🎫"}</Button>
            <Link href={`/traveler/trips/${trip.id}/itinerary`}><GhostButton>Fine-tune itinerary</GhostButton></Link>
            <Link href={`/traveler/trips/${trip.id}`}><GhostButton>View trip</GhostButton></Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
      <span className="text-ink-500">{label}</span>
      <span className="font-semibold text-ink-900">{value}</span>
    </div>
  );
}
