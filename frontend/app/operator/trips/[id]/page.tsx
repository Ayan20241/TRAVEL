"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import {
  TripFull,
  ItineraryItemFull,
  BookingFull,
  DisruptionFull,
  RecoveryOptionFull,
  Pricing,
  Profile,
  ImpactResult,
  OPEN_DISRUPTION_STATUSES,
  useApi,
  DataView,
  TableShell,
  Td,
  StatusBadge,
  ConfirmDialog,
  Modal,
} from "../../_shared";
import {
  PageHeader,
  Card,
  Button,
  GhostButton,
  Input,
  Select,
  Label,
  fmtMoney,
  fmtDate,
  fmtTime,
} from "@/components/ui";

const DISRUPTION_TYPES = [
  "FLIGHT_DELAY",
  "FLIGHT_CANCELLATION",
  "TRAIN_DELAY",
  "HOTEL_UNAVAILABLE",
  "ACTIVITY_CANCELLED",
  "TRANSFER_UNAVAILABLE",
];

export default function TripDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const trip = useApi<TripFull>(`/api/v1/trips/${id}`);

  return (
    <>
      <DataView
        loading={trip.loading}
        error={trip.error}
        empty={!trip.data}
        onRetry={trip.refetch}
        emptyTitle="Trip not found"
        emptyHint="This trip may have been deleted."
      >
        {trip.data && <TripDetail trip={trip.data} onChanged={trip.refetch} />}
      </DataView>
    </>
  );
}

function TripDetail({ trip, onChanged }: { trip: TripFull; onChanged: () => void }) {
  const users = useApi<Profile[]>(`/api/v1/users?page_size=100`);
  const traveler = users.data?.find((u) => u.id === trip.traveler_id);
  const coordinator = users.data?.find((u) => u.id === trip.coordinator_id);

  return (
    <>
      <PageHeader
        title={trip.title}
        subtitle={`${trip.destination} · ${fmtDate(trip.start_date)} → ${fmtDate(trip.end_date)} · ${trip.duration_days} days`}
        action={<StatusBadge value={trip.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Traveler</h3>
          <p className="font-semibold text-ink-900">{traveler?.full_name || "—"}</p>
          <p className="text-sm text-ink-500">{traveler?.email || trip.traveler_id}</p>
          {traveler?.phone && <p className="text-sm text-ink-500">{traveler.phone}</p>}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Coordinator</h3>
            <CoordinatorAssign trip={trip} current={coordinator} onChanged={onChanged} />
          </div>
        </Card>
        <PricingCard tripId={trip.id} />
        <Card>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Trip facts</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Travel style</dt><dd className="font-medium">{trip.travel_style || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Budget</dt><dd className="font-medium">{fmtMoney(trip.budget, trip.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Currency</dt><dd className="font-medium">{trip.currency}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Operator ID</dt><dd className="max-w-[140px] truncate font-medium" title={trip.operator_id || ""}>{trip.operator_id || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Updated</dt><dd className="font-medium">{fmtDate(trip.updated_at)}</dd></div>
          </dl>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <ItinerarySection tripId={trip.id} />
        <BookingsSection tripId={trip.id} />
      </div>

      <DisruptionsSection tripId={trip.id} />
      <CreateDisruption tripId={trip.id} />
    </>
  );
}

/* ---------------- coordinator assignment ---------------- */

function CoordinatorAssign({ trip, current, onChanged }: { trip: TripFull; current?: Profile; onChanged: () => void }) {
  const coords = useApi<Profile[]>(`/api/v1/users?role=COORDINATOR`);
  const [sel, setSel] = useState(trip.coordinator_id || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const assign = async () => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/v1/trips/${trip.id}`, { method: "PATCH", body: { coordinator_id: sel } });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-ink-500">
        Currently: <span className="font-semibold text-ink-900">{current ? current.full_name || current.email : "Unassigned"}</span>
      </p>
      <div className="mt-3 flex gap-2">
        <Select value={sel} onChange={(e) => setSel(e.target.value)} disabled={coords.loading} aria-label="Assign coordinator">
          <option value="">Select coordinator…</option>
          {(coords.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name || c.email} ({c.email})
            </option>
          ))}
        </Select>
        <Button onClick={assign} disabled={!sel || busy || sel === trip.coordinator_id}>
          {busy ? "Saving…" : "Assign"}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}

/* ---------------- pricing ---------------- */

function PricingCard({ tripId }: { tripId: string }) {
  const p = useApi<Pricing>(`/api/v1/trips/${tripId}/pricing`);
  return (
    <Card>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Pricing (backend-calculated)</h3>
      <DataView loading={p.loading} error={p.error} empty={!p.data} onRetry={p.refetch} emptyTitle="No pricing yet">
        {p.data && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Transportation</dt><dd className="font-medium">{fmtMoney(p.data.transportation, p.data.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Accommodation</dt><dd className="font-medium">{fmtMoney(p.data.accommodation, p.data.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Activities</dt><dd className="font-medium">{fmtMoney(p.data.activities, p.data.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Other</dt><dd className="font-medium">{fmtMoney(p.data.other, p.data.currency)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-semibold">Estimated total</dt><dd className="font-bold">{fmtMoney(p.data.estimated_total, p.data.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Budget</dt><dd className="font-medium">{fmtMoney(p.data.budget, p.data.currency)}</dd></div>
            {p.data.within_budget !== null && (
              <div className="flex justify-between">
                <dt className="text-ink-500">Within budget</dt>
                <dd className={`font-semibold ${p.data.within_budget ? "text-emerald-600" : "text-red-600"}`}>
                  {p.data.within_budget ? "Yes" : "Over budget"}
                </dd>
              </div>
            )}
          </dl>
        )}
      </DataView>
    </Card>
  );
}

/* ---------------- itinerary ---------------- */

function ItinerarySection({ tripId }: { tripId: string }) {
  const items = useApi<ItineraryItemFull[]>(`/api/v1/trips/${tripId}/itinerary`);
  const list = (items.data ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  const days = new Map<string, ItineraryItemFull[]>();
  for (const it of list) {
    const day = it.start_time.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(it);
  }

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-ink-900">Itinerary</h2>
      <DataView
        loading={items.loading}
        error={items.error}
        empty={list.length === 0}
        onRetry={items.refetch}
        emptyTitle="No itinerary items"
        emptyHint="The traveler hasn't built their itinerary yet."
      >
        <div className="space-y-4">
          {[...days.entries()].map(([day, dayItems]) => (
            <Card key={day} className="!p-0 overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5">
                <p className="text-sm font-bold text-ink-900">{fmtDate(day)}</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {dayItems.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">
                        <span className="text-xs font-bold uppercase tracking-wide text-brand-600">{it.type.replace(/_/g, " ")} </span>
                        {it.title}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {fmtTime(it.start_time)} – {fmtTime(it.end_time)}
                        {it.location ? ` · ${it.location}` : ""}
                        {it.cost != null ? ` · ${fmtMoney(it.cost, it.currency)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge value={it.status} />
                      {it.booked_status !== "PLANNED" && <StatusBadge value={it.booked_status} />}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </DataView>
    </section>
  );
}

/* ---------------- bookings ---------------- */

function BookingsSection({ tripId }: { tripId: string }) {
  const b = useApi<BookingFull[]>(`/api/v1/trips/${tripId}/bookings`);
  const [target, setTarget] = useState<BookingFull | null>(null);
  const [action, setAction] = useState<"CONFIRMED" | "CANCELLED" | null>(null);
  const [busy, setBusy] = useState(false);
  const list = b.data ?? [];

  const doUpdate = async () => {
    if (!target || !action) return;
    setBusy(true);
    try {
      await api(`/api/v1/bookings/${target.id}`, { method: "PATCH", body: { status: action } });
      setTarget(null);
      setAction(null);
      b.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-ink-900">Bookings</h2>
      <DataView
        loading={b.loading}
        error={b.error}
        empty={list.length === 0}
        onRetry={b.refetch}
        emptyTitle="No bookings"
        emptyHint="No bookings have been created for this trip yet."
      >
        <TableShell head={["Service", "Reference", "Amount", "Status", "Actions"]}>
          {list.map((bk) => (
            <tr key={bk.id} className="hover:bg-slate-50">
              <Td>
                <p className="font-semibold text-ink-900">{bk.service_name}</p>
                <p className="text-xs text-ink-500">{bk.service_type.replace(/_/g, " ")}</p>
              </Td>
              <Td className="text-xs">{bk.reference_code || "—"}</Td>
              <Td className="whitespace-nowrap">{fmtMoney(bk.amount, bk.currency)}</Td>
              <Td><StatusBadge value={bk.status} /></Td>
              <Td>
                <div className="flex gap-2">
                  {bk.status !== "CONFIRMED" && (
                    <button
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                      onClick={() => { setTarget(bk); setAction("CONFIRMED"); }}
                    >
                      Confirm
                    </button>
                  )}
                  {bk.status !== "CANCELLED" && (
                    <button
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                      onClick={() => { setTarget(bk); setAction("CANCELLED"); }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </TableShell>
      </DataView>
      <ConfirmDialog
        open={!!target}
        title={action === "CANCELLED" ? "Cancel booking?" : "Confirm booking?"}
        body={target ? `${target.service_name}. This will notify the traveler and be recorded in the audit log.` : undefined}
        confirmLabel={action === "CANCELLED" ? "Cancel booking" : "Confirm booking"}
        danger={action === "CANCELLED"}
        busy={busy}
        onConfirm={doUpdate}
        onCancel={() => { setTarget(null); setAction(null); }}
      />
    </section>
  );
}

/* ---------------- disruptions ---------------- */

function DisruptionsSection({ tripId }: { tripId: string }) {
  const d = useApi<DisruptionFull[]>(`/api/v1/trips/${tripId}/disruptions`);
  const items = useApi<ItineraryItemFull[]>(`/api/v1/trips/${tripId}/itinerary`);
  const titles = new Map((items.data ?? []).map((it) => [it.id, it.title]));
  const list = d.data ?? [];

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-bold text-ink-900">Disruptions</h2>
      <DataView
        loading={d.loading}
        error={d.error}
        empty={list.length === 0}
        onRetry={d.refetch}
        emptyTitle="No disruptions"
        emptyHint="This trip has not been disrupted. You can simulate one below."
      >
        <div className="space-y-4">
          {list.map((dis) => (
            <DisruptionCard key={dis.id} dis={dis} itemTitles={titles} onResolved={() => { d.refetch(); items.refetch(); }} />
          ))}
        </div>
      </DataView>
    </section>
  );
}

function DisruptionCard({
  dis,
  itemTitles,
  onResolved,
}: {
  dis: DisruptionFull;
  itemTitles: Map<string, string>;
  onResolved: () => void;
}) {
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [impactBusy, setImpactBusy] = useState(false);
  const [options, setOptions] = useState<RecoveryOptionFull[] | null>(null);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<RecoveryOptionFull | null>(null);
  const [selectBusy, setSelectBusy] = useState(false);

  const runImpact = async () => {
    setImpactBusy(true);
    setErr(null);
    try {
      setImpact(await api<ImpactResult>(`/api/v1/disruptions/${dis.id}/impact`, { method: "POST" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Impact analysis failed");
    } finally {
      setImpactBusy(false);
    }
  };

  const loadOptions = async () => {
    setOptionsBusy(true);
    setErr(null);
    try {
      setOptions(await api<RecoveryOptionFull[]>(`/api/v1/disruptions/${dis.id}/recovery-options`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load recovery options");
    } finally {
      setOptionsBusy(false);
    }
  };

  const generateOptions = async () => {
    setGenBusy(true);
    setErr(null);
    try {
      await api(`/api/v1/disruptions/${dis.id}/recovery-options`, { method: "POST" });
      await loadOptions();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not generate recovery options");
    } finally {
      setGenBusy(false);
    }
  };

  const selectOption = async () => {
    if (!selecting) return;
    setSelectBusy(true);
    try {
      await api(`/api/v1/recovery-options/${selecting.id}/select`, { method: "POST" });
      setSelecting(null);
      onResolved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Selection failed");
    } finally {
      setSelectBusy(false);
    }
  };

  const open = OPEN_DISRUPTION_STATUSES.includes(dis.status);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink-900">
            {dis.type.replace(/_/g, " ")}
            {dis.delay_minutes > 0 && <span className="text-red-600"> · +{dis.delay_minutes} min</span>}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {dis.reason || "No reason recorded"}
            {dis.source_item_id && itemTitles.get(dis.source_item_id) ? ` · Source: ${itemTitles.get(dis.source_item_id)}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">Reported {fmtDate(dis.created_at)} {fmtTime(dis.created_at)}</p>
        </div>
        <StatusBadge value={dis.status} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <GhostButton onClick={runImpact} disabled={impactBusy}>
          {impactBusy ? "Analyzing…" : "Analyze impact"}
        </GhostButton>
        <GhostButton onClick={generateOptions} disabled={genBusy}>
          {genBusy ? "Generating…" : "Generate recovery options"}
        </GhostButton>
        <GhostButton onClick={loadOptions} disabled={optionsBusy}>
          {optionsBusy ? "Loading…" : options ? "Refresh options" : "Show options"}
        </GhostButton>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      {impact && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-ink-900">
            Impact analysis {impact.feasible ? <span className="text-emerald-600">— itinerary feasible</span> : <span className="text-red-600">— itinerary infeasible</span>}
          </p>
          <p className="mt-1 text-sm text-ink-700">{impact.explanation}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-600">Broken items</p>
              <ul className="mt-1 text-sm text-ink-700">
                {impact.broken_items.length === 0 && <li className="text-ink-500">None</li>}
                {impact.broken_items.map((id) => (
                  <li key={id}>• {itemTitles.get(id) || id}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-600">At-risk items</p>
              <ul className="mt-1 text-sm text-ink-700">
                {impact.at_risk_items.length === 0 && <li className="text-ink-500">None</li>}
                {impact.at_risk_items.map((id) => (
                  <li key={id}>• {itemTitles.get(id) || id}</li>
                ))}
              </ul>
            </div>
          </div>
          {impact.violations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Constraint violations</p>
              <ul className="mt-1 space-y-1 text-sm text-ink-700">
                {impact.violations.map((v, i) => (
                  <li key={i}>• {v.message || `${v.rule} on ${itemTitles.get(v.item_id || "") || v.item_id}`}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {options && (
        <div className="mt-4 space-y-3">
          {options.length === 0 && <p className="text-sm text-ink-500">No recovery options yet — generate them first.</p>}
          {options
            .slice()
            .sort((a, b) => (a.ai_rank ?? 99) - (b.ai_rank ?? 99))
            .map((o) => (
              <div key={o.id} className={`rounded-xl border p-4 ${o.selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">
                      {o.ai_rank != null && <span className="mr-2 rounded-md bg-brand-100 px-1.5 py-0.5 text-xs text-brand-700">AI #{o.ai_rank}</span>}
                      {o.title}
                    </p>
                    {o.description && <p className="mt-1 text-sm text-ink-500">{o.description}</p>}
                    {o.ai_reason && <p className="mt-1 text-xs italic text-ink-500">AI: {o.ai_reason}</p>}
                    <p className="mt-1 text-xs text-ink-500">
                      Action: {o.action.replace(/_/g, " ")} · Cost impact: {o.estimated_cost_delta >= 0 ? "+" : ""}{fmtMoney(o.estimated_cost_delta)}
                      {o.experience_impact ? ` · Experience: ${o.experience_impact}` : ""}
                      {o.feasibility ? " · Feasible" : " · Not feasible"}
                    </p>
                  </div>
                  {o.selected ? (
                    <span className="text-xs font-bold text-emerald-700">SELECTED</span>
                  ) : (
                    open && (
                      <Button onClick={() => setSelecting(o)} disabled={!o.feasibility}>
                        Select for traveler
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={!!selecting}
        title="Apply recovery option?"
        body={selecting ? `"${selecting.title}". The itinerary will be updated, the traveler notified, and the change recorded in the audit log.` : undefined}
        confirmLabel="Apply option"
        busy={selectBusy}
        onConfirm={selectOption}
        onCancel={() => setSelecting(null)}
      />
    </Card>
  );
}

/* ---------------- simulate disruption ---------------- */

function CreateDisruption({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(DISRUPTION_TYPES[0]);
  const [sourceItem, setSourceItem] = useState("");
  const [delay, setDelay] = useState("180");
  const [newStart, setNewStart] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const items = useApi<ItineraryItemFull[]>(open ? `/api/v1/trips/${tripId}/itinerary` : null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { type, delay_minutes: parseInt(delay || "0", 10) };
      if (sourceItem) body.source_item_id = sourceItem;
      if (newStart) body.new_start_time = new Date(newStart).toISOString();
      if (reason.trim()) body.reason = reason.trim();
      await api(`/api/v1/trips/${tripId}/disruptions`, { method: "POST", body });
      setDone(true);
      setOpen(false);
      setReason("");
      setNewStart("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record disruption");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6">
      <Button onClick={() => { setOpen(true); setDone(false); }}>Simulate disruption</Button>
      {done && <p className="mt-2 text-sm text-emerald-600">Disruption recorded. Reload the page section to analyze its impact.</p>}
      <Modal open={open} title="Simulate disruption" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <div>
            <Label>Disruption type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {DISRUPTION_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Source itinerary item (optional)</Label>
            <Select value={sourceItem} onChange={(e) => setSourceItem(e.target.value)} disabled={items.loading}>
              <option value="">None</option>
              {(items.data ?? []).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.type} — {it.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Delay (minutes)</Label>
              <Input type="number" min={0} value={delay} onChange={(e) => setDelay(e.target.value)} />
            </div>
            <div>
              <Label>New start time (optional)</Label>
              <Input type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Airline notified of crew delay" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-3">
            <GhostButton onClick={() => setOpen(false)} disabled={busy}>Cancel</GhostButton>
            <Button onClick={submit} disabled={busy}>{busy ? "Recording…" : "Record disruption"}</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
