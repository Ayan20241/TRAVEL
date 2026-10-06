"use client";
import CatalogPage, { FieldDef, ColumnDef } from "../_catalog";
import { fmtMoney } from "@/components/ui";

const fields: FieldDef[] = [
  { key: "mode", label: "Mode", type: "select", required: true, options: [
    { value: "FLIGHT", label: "Flight" },
    { value: "TRAIN", label: "Train" },
    { value: "BUS", label: "Bus" },
    { value: "TRANSFER", label: "Transfer" },
    { value: "CAR", label: "Car" },
    { value: "FERRY", label: "Ferry" },
  ]},
  { key: "name", label: "Name", type: "text", required: true, placeholder: "e.g. IndiGo 6E-204" },
  { key: "origin", label: "Origin", type: "text", placeholder: "e.g. Delhi" },
  { key: "destination", label: "Destination", type: "text", placeholder: "e.g. Mumbai" },
  { key: "price", label: "Price", type: "number", placeholder: "e.g. 5200" },
  { key: "currency", label: "Currency", type: "text", placeholder: "INR" },
  { key: "vendor_id", label: "Vendor", type: "vendor" },
];

const columns: ColumnDef[] = [
  { key: "name", label: "Service", render: (it) => (
    <div>
      <p className="font-semibold text-ink-900">{String(it.name)}</p>
      <p className="text-xs text-ink-500">{String(it.mode).replace(/_/g, " ")}</p>
    </div>
  )},
  { key: "origin", label: "Route", render: (it) => (
    <span className="text-xs">{it.origin || it.destination ? `${it.origin || "?"} → ${it.destination || "?"}` : "—"}</span>
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

export default function TransportationPage() {
  return (
    <CatalogPage
      title="Transportation"
      singular="transportation service"
      subtitle="Flights, trains, buses, and transfers travelers can book."
      endpoint="/api/v1/transportation"
      fields={fields}
      columns={columns}
    />
  );
}
