"use client";
import CatalogPage, { FieldDef, ColumnDef } from "../_catalog";
import { fmtMoney } from "@/components/ui";

const fields: FieldDef[] = [
  { key: "name", label: "Vendor name", type: "text", required: true, placeholder: "e.g. Skyline Travels" },
  { key: "service_type", label: "Service type", type: "text", required: true, placeholder: "e.g. FLIGHT, HOTEL, TRANSFER", help: "Short category label used when booking through this vendor." },
  { key: "contact_email", label: "Contact email", type: "text", placeholder: "ops@example.com" },
  { key: "contact_phone", label: "Contact phone", type: "text", placeholder: "+91 98000 00000" },
  { key: "city", label: "City", type: "text", placeholder: "e.g. Delhi" },
  { key: "profile_id", label: "Linked user account", type: "profile", profileRole: "VENDOR", help: "Links this vendor to a user with the VENDOR role so they can manage their own services." },
];

const columns: ColumnDef[] = [
  { key: "name", label: "Vendor", render: (it) => (
    <div>
      <p className="font-semibold text-ink-900">{String(it.name)}</p>
      <p className="text-xs text-ink-500">{String(it.service_type).replace(/_/g, " ")}</p>
    </div>
  )},
  { key: "contact_email", label: "Contact", render: (it) => (
    <div className="text-xs">
      <p>{String(it.contact_email || "—")}</p>
      <p className="text-ink-500">{String(it.contact_phone || "")}</p>
    </div>
  )},
  { key: "city", label: "City" },
  { key: "profile_id", label: "Linked profile", render: (it, { profiles }) => {
    const pid = String(it.profile_id || "");
    if (!pid) return <span className="text-ink-500">—</span>;
    const p = profiles.get(pid);
    return p ? (
      <div className="text-xs">
        <p className="font-medium text-ink-900">{p.full_name || p.email}</p>
        <p className="text-ink-500">{p.email} · {p.role}</p>
      </div>
    ) : <span className="text-xs text-ink-500">{pid.slice(0, 8)}…</span>;
  }},
  { key: "rating", label: "Rating", render: (it) => <span>{it.rating != null ? `${it.rating} ★` : "—"}</span> },
];

export default function VendorsPage() {
  return (
    <CatalogPage
      title="Vendors"
      singular="vendor"
      subtitle="Companies that supply flights, hotels, transfers, and activities."
      endpoint="/api/v1/vendors"
      fields={fields}
      columns={columns}
      supportsDelete={false}
      deleteNote="Deactivation is not exposed by the current API contract for vendors (no DELETE /api/v1/vendors/{id}). Edit details instead; vendors can be hidden via the backend."
    />
  );
}
