"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type ItineraryItem, type Dependency } from "@/lib/client-api";
import {
  Button, GhostButton, Card, Input, Select, Label, Badge, Spinner, EmptyState, ErrorState,
  PageHeader, fmtMoney, fmtDate, fmtTime,
} from "@/components/ui";

const ITEM_TYPES = ["FLIGHT", "TRAIN", "BUS", "TRANSFER", "HOTEL", "ACTIVITY", "EVENT", "RESTAURANT", "OTHER"];
const ITEM_STATUSES = ["PLANNED", "CONFIRMED", "AT_RISK", "BROKEN", "CANCELLED", "COMPLETED", "REBOOKED"];

type ItemForm = {
  type: string; title: string; description: string; location: string;
  start_time: string; end_time: string; cost: string; is_fixed: boolean; status: string;
};

const emptyForm: ItemForm = {
  type: "ACTIVITY", title: "", description: "", location: "",
  start_time: "", end_time: "", cost: "", is_fixed: false, status: "PLANNED",
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ItineraryBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Add form
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Dependency form
  const [depForm, setDepForm] = useState({ source_item_id: "", target_item_id: "", dependency_type: "SEQUENTIAL", minimum_required_buffer_minutes: 30 });
  const [depBusy, setDepBusy] = useState(false);

  const load = async () => {
    setError("");
    try {
      const [it, dp] = await Promise.all([
        api<ItineraryItem[]>(`/api/v1/trips/${id}/itinerary`),
        api<Dependency[]>(`/api/v1/trips/${id}/dependencies`).catch(() => [] as Dependency[]),
      ]);
      setItems(it.sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setDeps(dp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load itinerary.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, [id]);

  const setF = (k: keyof ItemForm, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));
  const setE = (k: keyof ItemForm, v: string | boolean) => setEditForm((p) => ({ ...p, [k]: v }));

  const formToPayload = (f: ItemForm) => ({
    type: f.type,
    title: f.title.trim(),
    description: f.description.trim() || null,
    location: f.location.trim() || null,
    start_time: new Date(f.start_time).toISOString(),
    end_time: new Date(f.end_time).toISOString(),
    cost: f.cost ? Number(f.cost) : null,
    is_fixed: f.is_fixed,
    status: f.status,
  });

  const addItem = async () => {
    if (!form.title.trim() || !form.start_time || !form.end_time) return;
    setAdding(true);
    try {
      await api(`/api/v1/trips/${id}/itinerary`, { method: "POST", body: formToPayload(form) });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add item.");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (it: ItineraryItem) => {
    setEditing(it.id);
    setEditForm({
      type: it.type, title: it.title, description: it.description || "", location: it.location || "",
      start_time: toLocalInput(it.start_time), end_time: toLocalInput(it.end_time),
      cost: it.cost != null ? String(it.cost) : "", is_fixed: it.is_fixed, status: it.status,
    });
  };

  const saveEdit = async (itemId: string) => {
    setSaving(true);
    try {
      await api(`/api/v1/itinerary/${itemId}`, { method: "PATCH", body: formToPayload(editForm) });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update item.");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (itemId: string, title: string) => {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    try {
      await api(`/api/v1/itinerary/${itemId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete item.");
    }
  };

  const addDep = async () => {
    if (!depForm.source_item_id || !depForm.target_item_id) return;
    setDepBusy(true);
    try {
      await api(`/api/v1/trips/${id}/dependencies`, { method: "POST", body: depForm });
      setDepForm({ source_item_id: "", target_item_id: "", dependency_type: "SEQUENTIAL", minimum_required_buffer_minutes: 30 });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add dependency.");
    } finally {
      setDepBusy(false);
    }
  };

  const deleteDep = async (depId: string) => {
    if (!window.confirm("Delete this dependency?")) return;
    try {
      await api(`/api/v1/dependencies/${depId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete dependency.");
    }
  };

  const itemName = (iid: string) => items.find((i) => i.id === iid)?.title || iid.slice(0, 8);

  if (!loaded) return <Spinner />;

  return (
    <div>
      <Link href={`/traveler/trips/${id}`} className="text-sm font-medium text-brand-600 hover:underline">← Back to trip</Link>
      <PageHeader title="Itinerary builder" subtitle="Add, edit, and link the pieces of your trip." />

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Items */}
      <h2 className="mb-3 text-lg font-bold text-ink-900">Items ({items.length})</h2>
      {items.length === 0 ? (
        <EmptyState title="No items yet" hint="Add your first flight, hotel, or activity below." />
      ) : (
        <div className="space-y-2">
          {items.map((it) =>
            editing === it.id ? (
              <Card key={it.id}>
                <ItemFormFields f={editForm} set={setE} showStatus />
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => saveEdit(it.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                  <GhostButton onClick={() => setEditing(null)}>Cancel</GhostButton>
                </div>
              </Card>
            ) : (
              <Card key={it.id} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge value={it.type} />
                      <p className="font-bold text-ink-900">{it.title}</p>
                      <Badge value={it.status} />
                      {it.is_fixed && <span className="text-xs font-semibold text-ink-500">🔒 fixed</span>}
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {fmtDate(it.start_time)} · {fmtTime(it.start_time)} – {fmtTime(it.end_time)}
                      {it.location && ` · 📍 ${it.location}`}
                      {it.cost != null && ` · ${fmtMoney(it.cost, it.currency)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <GhostButton onClick={() => startEdit(it)}>Edit</GhostButton>
                    <button onClick={() => deleteItem(it.id, it.title)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            )
          )}
        </div>
      )}

      {/* Add item */}
      <Card className="mt-6">
        <h3 className="text-lg font-bold text-ink-900">Add an item</h3>
        <div className="mt-4">
          <ItemFormFields f={form} set={setF} />
        </div>
        <Button className="mt-4" onClick={addItem} disabled={adding || !form.title.trim() || !form.start_time || !form.end_time}>
          {adding ? "Adding…" : "Add item"}
        </Button>
      </Card>

      {/* Dependencies */}
      <h2 className="mb-3 mt-10 text-lg font-bold text-ink-900">Dependencies</h2>
      <p className="mb-3 text-sm text-ink-500">
        Link items that must follow each other (e.g. flight → transfer → hotel). The constraint engine uses these buffers to detect broken connections.
      </p>
      {deps.length === 0 ? (
        <EmptyState title="No dependencies" hint="Link two items so the engine knows they depend on each other." />
      ) : (
        <div className="space-y-2">
          {deps.map((d) => (
            <Card key={d.id} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-semibold text-ink-900">{itemName(d.source_item_id)}</span>
                  <span className="mx-2 text-ink-500">→</span>
                  <span className="font-semibold text-ink-900">{itemName(d.target_item_id)}</span>
                  <span className="ml-3"><Badge value={d.dependency_type} /></span>
                  <span className="ml-2 text-xs text-ink-500">buffer ≥ {d.minimum_required_buffer_minutes} min</span>
                </p>
                <button onClick={() => deleteDep(d.id)} className="text-sm font-semibold text-red-600 hover:underline">Remove</button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card className="mt-4">
        <h3 className="font-bold text-ink-900">Link two items</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>From (must happen first)</Label>
            <Select value={depForm.source_item_id} onChange={(e) => setDepForm((p) => ({ ...p, source_item_id: e.target.value }))}>
              <option value="">Select item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </Select>
          </div>
          <div>
            <Label>To (depends on it)</Label>
            <Select value={depForm.target_item_id} onChange={(e) => setDepForm((p) => ({ ...p, target_item_id: e.target.value }))}>
              <option value="">Select item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={depForm.dependency_type} onChange={(e) => setDepForm((p) => ({ ...p, dependency_type: e.target.value }))}>
              <option value="SEQUENTIAL">SEQUENTIAL</option>
              <option value="SPATIAL">SPATIAL</option>
            </Select>
          </div>
          <div>
            <Label>Min buffer (min)</Label>
            <Input type="number" min={0} max={1440} value={depForm.minimum_required_buffer_minutes} onChange={(e) => setDepForm((p) => ({ ...p, minimum_required_buffer_minutes: Number(e.target.value) }))} />
          </div>
        </div>
        <Button className="mt-3" onClick={addDep} disabled={depBusy || !depForm.source_item_id || !depForm.target_item_id || depForm.source_item_id === depForm.target_item_id}>
          {depBusy ? "Linking…" : "Link items"}
        </Button>
      </Card>
    </div>
  );
}

function ItemFormFields({ f, set, showStatus = false }: { f: ItemForm; set: (k: keyof ItemForm, v: string | boolean) => void; showStatus?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>Type</Label>
        <Select value={f.type} onChange={(e) => set("type", e.target.value)}>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      <div>
        <Label>Title</Label>
        <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Flight DEL → CDG" />
      </div>
      <div>
        <Label>Start</Label>
        <Input type="datetime-local" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} />
      </div>
      <div>
        <Label>End</Label>
        <Input type="datetime-local" value={f.end_time} min={f.start_time} onChange={(e) => set("end_time", e.target.value)} />
      </div>
      <div>
        <Label>Location</Label>
        <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Airport, hotel name…" />
      </div>
      <div>
        <Label>Cost (INR)</Label>
        <Input type="number" min={0} value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" />
      </div>
      <div className="sm:col-span-2">
        <Label>Description</Label>
        <Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional details…" />
      </div>
      {showStatus && (
        <div>
          <Label>Status</Label>
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={f.is_fixed} onChange={(e) => set("is_fixed", e.target.checked)} className="h-4 w-4 accent-brand-600" />
        Fixed — cannot be moved by recovery
      </label>
    </div>
  );
}
