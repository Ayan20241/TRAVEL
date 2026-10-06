"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type Trip, type Pricing } from "@/lib/client-api";
import { Card, Badge, Spinner, ErrorState, PageHeader, fmtMoney } from "@/components/ui";
import { PricingRows } from "../page";

const CATEGORY_META: [string, keyof Pick<Pricing, "transportation" | "accommodation" | "activities" | "other">, string, string][] = [
  ["Transportation", "transportation", "✈️", "bg-brand-600"],
  ["Accommodation", "accommodation", "🏨", "bg-emerald-500"],
  ["Activities", "activities", "🎯", "bg-amber-500"],
  ["Other", "other", "📌", "bg-slate-400"],
];

export default function BudgetPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [t, p] = await Promise.all([
        api<Trip>(`/api/v1/trips/${id}`),
        api<Pricing>(`/api/v1/trips/${id}/pricing`),
      ]);
      setTrip(t);
      setPricing(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load budget.");
    }
  };

  useEffect(() => { load(); }, [id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!trip || !pricing) return <Spinner />;

  const max = Math.max(pricing.transportation, pricing.accommodation, pricing.activities, pricing.other, 1);
  const pctOfBudget = pricing.budget && pricing.budget > 0 ? Math.min(100, (pricing.estimated_total / pricing.budget) * 100) : null;

  return (
    <div>
      <Link href={`/traveler/trips/${id}`} className="text-sm font-medium text-brand-600 hover:underline">← Back to trip</Link>
      <PageHeader title="Budget" subtitle={`Cost breakdown for “${trip.title}”`} />

      {/* Category bars */}
      <Card>
        <h2 className="text-lg font-bold text-ink-900">Spending by category</h2>
        <div className="mt-4 space-y-4">
          {CATEGORY_META.map(([label, key, icon, bar]) => {
            const v = pricing[key];
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink-700">{icon} {label}</span>
                  <span className="font-bold text-ink-900">{fmtMoney(v, pricing.currency)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${(v / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Breakdown */}
        <Card>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Cost breakdown</h2>
          <PricingRows pricing={pricing} />
        </Card>

        {/* Budget comparison */}
        <Card>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Budget comparison</h2>
          {pricing.budget == null ? (
            <p className="text-sm text-ink-500">No budget was set for this trip.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500">Estimated</span>
                <span className="font-bold text-ink-900">{fmtMoney(pricing.estimated_total, pricing.currency)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-ink-500">Budget</span>
                <span className="font-bold text-ink-900">{fmtMoney(pricing.budget, pricing.currency)}</span>
              </div>
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${pricing.within_budget === false ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${pctOfBudget ?? 0}%` }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                {pricing.within_budget != null && <Badge value={pricing.within_budget ? "CONFIRMED" : "BROKEN"} />}
                <span className="text-sm text-ink-500">
                  {pricing.within_budget === false
                    ? `${fmtMoney(pricing.estimated_total - pricing.budget, pricing.currency)} over budget`
                    : pricing.within_budget === true
                      ? `${fmtMoney(pricing.budget - pricing.estimated_total, pricing.currency)} under budget`
                      : "Budget status unknown"}
                </span>
              </div>
              <p className="mt-3 text-xs text-ink-500">
                Totals are recalculated by the backend — what you see here is authoritative, not a frontend estimate.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
