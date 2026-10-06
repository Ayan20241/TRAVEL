"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Profile, Role, useApi, DataView, TableShell, Td, StatusBadge, ConfirmDialog, Modal } from "./_shared";
import { PageHeader, Button, GhostButton, Input, Select, Label } from "@/components/ui";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "vendor" | "profile" | "textarea";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  profileRole?: Role;
  help?: string;
};

export type ColumnDef = {
  key: string;
  label: string;
  render?: (item: Record<string, unknown>, ctx: { profiles: Map<string, Profile>; vendors: Map<string, Record<string, unknown>> }) => React.ReactNode;
};

type CatalogItem = Record<string, unknown> & { id: string; is_active?: boolean };

function formToBody(fields: FieldDef[], form: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (form[f.key] ?? "").trim();
    if (!raw) continue;
    if (f.type === "number") {
      const n = Number(raw);
      if (!Number.isNaN(n)) body[f.key] = n;
    } else if (f.key === "amenities") {
      body[f.key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      body[f.key] = raw;
    }
  }
  return body;
}

function itemToForm(fields: FieldDef[], item: CatalogItem): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) {
    const v = item[f.key];
    if (v == null) form[f.key] = "";
    else if (Array.isArray(v)) form[f.key] = v.join(", ");
    else form[f.key] = String(v);
  }
  return form;
}

export default function CatalogPage({
  title,
  singular,
  subtitle,
  endpoint,
  fields,
  columns,
  supportsDelete = true,
  deleteNote,
}: {
  title: string;
  singular: string;
  subtitle: string;
  endpoint: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  supportsDelete?: boolean;
  deleteNote?: string;
}) {
  const list = useApi<CatalogItem[]>(`${endpoint}?page_size=100`);
  const profilesRes = useApi<Profile[]>(`/api/v1/users?page_size=100`);
  const vendorsRes = useApi<CatalogItem[]>(fields.some((f) => f.type === "vendor") ? `/api/v1/vendors?page_size=100` : null);

  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const vendors = new Map((vendorsRes.data ?? []).map((v) => [v.id, v]));

  const openNew = () => {
    const f: Record<string, string> = {};
    for (const fd of fields) f[fd.key] = "";
    setForm(f);
    setFormErr(null);
    setEditing("new");
  };
  const openEdit = (item: CatalogItem) => {
    setForm(itemToForm(fields, item));
    setFormErr(null);
    setEditing(item);
  };

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !(form[f.key] ?? "").trim()) {
        setFormErr(`${f.label} is required.`);
        return;
      }
    }
    setFormBusy(true);
    setFormErr(null);
    try {
      const body = formToBody(fields, form);
      if (editing === "new") {
        await api(endpoint, { method: "POST", body });
      } else if (editing) {
        await api(`${endpoint}/${editing.id}`, { method: "PATCH", body });
      }
      setEditing(null);
      list.refetch();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setFormBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`${endpoint}/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      list.refetch();
    } finally {
      setDeleteBusy(false);
    }
  };

  const items = list.data ?? [];

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={<Button onClick={openNew}>+ Add new</Button>} />
      {deleteNote && !supportsDelete && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          {deleteNote}
        </div>
      )}
      <DataView
        loading={list.loading}
        error={list.error}
        empty={items.length === 0}
        onRetry={list.refetch}
        emptyTitle={`No ${title.toLowerCase()} yet`}
        emptyHint="Add the first one to start building the supply catalog."
        emptyAction={<Button onClick={openNew}>+ Add new</Button>}
      >
        <TableShell head={[...columns.map((c) => c.label), "Active", "Actions"]}>
          {items.map((it) => (
            <tr key={it.id} className="hover:bg-slate-50">
              {columns.map((c) => (
                <Td key={c.key}>
                  {c.render ? c.render(it, { profiles, vendors }) : <span>{String(it[c.key] ?? "—")}</span>}
                </Td>
              ))}
              <Td>
                {it.is_active === false ? <StatusBadge value="CANCELLED" /> : <span className="text-xs font-semibold text-emerald-600">Active</span>}
              </Td>
              <Td>
                <div className="flex gap-2">
                  <button className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => openEdit(it)}>
                    Edit
                  </button>
                  {supportsDelete && (
                    <button className="text-xs font-semibold text-red-600 hover:text-red-700" onClick={() => setDeleting(it)}>
                      Deactivate
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </TableShell>
      </DataView>

      <Modal open={!!editing} title={editing === "new" ? `Add ${singular}` : `Edit ${singular}`} onClose={() => setEditing(null)}>
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <Label>
                {f.label}
                {f.required ? " *" : ""}
              </Label>
              {f.type === "select" && f.options ? (
                <Select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  <option value="">Select…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              ) : f.type === "vendor" ? (
                <Select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} disabled={vendorsRes.loading}>
                  <option value="">None</option>
                  {(vendorsRes.data ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{String(v.name)} ({String(v.service_type)})</option>
                  ))}
                </Select>
              ) : f.type === "profile" ? (
                <Select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} disabled={profilesRes.loading}>
                  <option value="">None</option>
                  {(profilesRes.data ?? [])
                    .filter((p) => !f.profileRole || p.role === f.profileRole)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email} ({p.email})</option>
                    ))}
                </Select>
              ) : f.type === "textarea" ? (
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  rows={3}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              )}
              {f.help && <p className="mt-1 text-xs text-ink-500">{f.help}</p>}
            </div>
          ))}
          {formErr && <p className="text-sm text-red-600">{formErr}</p>}
          <div className="flex justify-end gap-3">
            <GhostButton onClick={() => setEditing(null)} disabled={formBusy}>Cancel</GhostButton>
            <Button onClick={submit} disabled={formBusy}>{formBusy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Deactivate this entry?"
        body={deleting ? `It will be hidden from the traveler catalog but kept for existing bookings. This is reversible by the backend team.` : undefined}
        confirmLabel="Deactivate"
        danger
        busy={deleteBusy}
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
