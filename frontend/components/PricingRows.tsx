"use client";
import type { Pricing } from "@/lib/client-api";
import { Badge, fmtMoney } from "@/components/ui";

export function PricingRows({ pricing }: { pricing: Pricing }) {
  const rows: [string, number][] = [
    ["Transportation", pricing.transportation],
    ["Accommodation", pricing.accommodation],
    ["Activities", pricing.activities],
    ["Other", pricing.other],
  ];
  return (
    <div className="space-y-2 text-sm">
      {rows.map(([label, v]) => (
        <div key={label} className="flex justify-between">
          <span className="text-ink-500">{label}</span>
          <span className="font-semibold text-ink-900">{fmtMoney(v, pricing.currency)}</span>
        </div>
      ))}
      <hr className="border-slate-100" />
      <div className="flex justify-between"><span className="text-ink-500">Base cost</span><span className="font-semibold">{fmtMoney(pricing.base_cost, pricing.currency)}</span></div>
      <div className="flex justify-between"><span className="text-ink-500">Additional cost</span><span className="font-semibold">{fmtMoney(pricing.additional_cost, pricing.currency)}</span></div>
      <div className="flex justify-between"><span className="text-ink-500">Discount</span><span className="font-semibold text-emerald-600">−{fmtMoney(pricing.discount, pricing.currency)}</span></div>
      <div className="flex justify-between text-base"><span className="font-bold text-ink-900">Estimated total</span><span className="font-bold text-ink-900">{fmtMoney(pricing.estimated_total, pricing.currency)}</span></div>
      {pricing.budget != null && (
        <div className="flex justify-between items-center pt-1">
          <span className="text-ink-500">Your budget</span>
          <span className="flex items-center gap-2">
            <span className="font-semibold">{fmtMoney(pricing.budget, pricing.currency)}</span>
            {pricing.within_budget != null && <Badge value={pricing.within_budget ? "CONFIRMED" : "BROKEN"} />}
          </span>
        </div>
      )}
    </div>
  );
}
