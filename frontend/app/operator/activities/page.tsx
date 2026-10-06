"use client";
import CatalogPage, { FieldDef, ColumnDef } from "../_catalog";
import { fmtMoney } from "@/components/ui";

const fields: FieldDef[] = [
  { key: "name", label: "Activity name", type: "text", required: true, placeholder: "e.g. Sunrise Taj Mahal tour" },
  { key: "city", label: "City", type: "text", required: true, placeholder: "e.g. Agra" },
  { key: "category", label: "Category", type: "text", placeholder: "e.g. Sightseeing, Food, Adventure" },
  { key: "duration_minutes", label: "Duration (minutes)", type: "number", placeholder: "e.g. 180" },
  { key: "price", label: "Price", type: "number", placeholder: "e.g. 2500" },
  { key: "currency", label: "Currency", type: "text", placeholder: "INR" },
  { key: "vendor_id", label: "Vendor", type: "vendor" },
];

const columns: ColumnDef[] = [
  { key: "name", label: "Activity", render: (it) => (
    <div>
      <p className="font-semibold text-ink-900">{String(it.name)}</p>
      <p className="text-xs text-ink-500">{String(it.city)}{it.category ? ` · ${it.category}` : ""}</p>
    </div>
  )},
  { key: "duration_minutes", label: "Duration", render: (it) => (
    <span>{it.duration_minutes != null ? `${it.duration_minutes} min` : "—"}</span>
  )},
  { key: "price", label: "Price", render: (it) => (
    <span className="whitespace-nowrap">{it.price != null ? fmtMoney(Number(it.price), String(it.currency || "INR")) : "—"}</span>
  )},
  { key: "vendor_id", label: "Vendor", render: (it, { vendors }) => {
    const vid = String(it.vendor_id || "");
    if (!vid) return <span className="text-ink-500">—</span>;
    const v = vendors.get(vid);
    return <span className="text-xs">{v ? String(v.name) : `${vid.slice(0, 8)}…`}</span>;
  }},
];

export default function ActivitiesPage() {
  return (
    <CatalogPage
      title="Activities"
      singular="activity"
      subtitle="Tours, events, and experiences travelers can add to itineraries."
      endpoint="/api/v1/activities"
      fields={fields}
      columns={columns}
    />
  );
}
