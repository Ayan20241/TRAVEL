"use client";
import CatalogPage, { FieldDef, ColumnDef } from "../_catalog";
import { fmtMoney } from "@/components/ui";

const fields: FieldDef[] = [
  { key: "name", label: "Hotel name", type: "text", required: true, placeholder: "e.g. The Grand Palace" },
  { key: "city", label: "City", type: "text", required: true, placeholder: "e.g. Jaipur" },
  { key: "country", label: "Country", type: "text", placeholder: "e.g. India" },
  { key: "stars", label: "Star rating", type: "number", placeholder: "1–7" },
  { key: "price_per_night", label: "Price per night", type: "number", placeholder: "e.g. 8500" },
  { key: "currency", label: "Currency", type: "text", placeholder: "INR" },
  { key: "amenities", label: "Amenities", type: "text", placeholder: "wifi, pool, spa", help: "Comma-separated list." },
  { key: "vendor_id", label: "Vendor", type: "vendor" },
];

const columns: ColumnDef[] = [
  { key: "name", label: "Hotel", render: (it) => (
    <div>
      <p className="font-semibold text-ink-900">{String(it.name)}</p>
      <p className="text-xs text-ink-500">{String(it.city)}{it.country ? `, ${it.country}` : ""}</p>
    </div>
  )},
  { key: "stars", label: "Stars", render: (it) => <span>{it.stars != null ? `${it.stars} ★` : "—"}</span> },
  { key: "price_per_night", label: "Per night", render: (it) => (
    <span className="whitespace-nowrap">{it.price_per_night != null ? fmtMoney(Number(it.price_per_night), String(it.currency || "INR")) : "—"}</span>
  )},
  { key: "amenities", label: "Amenities", render: (it) => (
    <span className="text-xs text-ink-500">{Array.isArray(it.amenities) && it.amenities.length > 0 ? it.amenities.join(", ") : "—"}</span>
  )},
  { key: "vendor_id", label: "Vendor", render: (it, { vendors }) => {
    const vid = String(it.vendor_id || "");
    if (!vid) return <span className="text-ink-500">—</span>;
    const v = vendors.get(vid);
    return <span className="text-xs">{v ? String(v.name) : `${vid.slice(0, 8)}…`}</span>;
  }},
];

export default function HotelsPage() {
  return (
    <CatalogPage
      title="Hotels"
      singular="hotel"
      subtitle="Accommodation inventory travelers can book from."
      endpoint="/api/v1/hotels"
      fields={fields}
      columns={columns}
    />
  );
}
