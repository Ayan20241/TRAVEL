"use client";
import { useState } from "react";
import { AuditLog, useApi, DataView, TableShell, Td } from "../_shared";
import { PageHeader, Input, Label, Button, fmtDate, fmtTime } from "@/components/ui";

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [applied, setApplied] = useState({ action: "", resourceType: "" });
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (applied.action.trim()) qs.set("action", applied.action.trim());
  if (applied.resourceType.trim()) qs.set("resource_type", applied.resourceType.trim());

  const logs = useApi<AuditLog[]>(`/api/v1/audit-logs?${qs.toString()}`, `${page}-${applied.action}-${applied.resourceType}`);
  const list = logs.data ?? [];
  const hasNext = list.length === PAGE_SIZE;

  const apply = () => {
    setPage(1);
    setApplied({ action, resourceType });
  };
  const clear = () => {
    setAction("");
    setResourceType("");
    setPage(1);
    setApplied({ action: "", resourceType: "" });
  };

  return (
    <>
      <PageHeader
        title="Audit logs"
        subtitle="Immutable record of who changed what, and when."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="w-56">
          <Label>Action</Label>
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. RECOVERY_SELECTED"
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
        </div>
        <div className="w-56">
          <Label>Resource type</Label>
          <Input
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            placeholder="e.g. trip, booking"
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
        </div>
        <Button onClick={apply}>Apply filters</Button>
        {(applied.action || applied.resourceType) && (
          <button onClick={clear} className="pb-2.5 text-sm font-semibold text-ink-500 hover:text-ink-700">
            Clear
          </button>
        )}
      </div>

      <DataView
        loading={logs.loading}
        error={logs.error}
        empty={list.length === 0}
        onRetry={logs.refetch}
        emptyTitle="No audit entries"
        emptyHint="Mutations made through the platform will be recorded here."
      >
        <TableShell head={["Time", "Action", "Resource", "Actor", "Change"]}>
          {list.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <Td className="whitespace-nowrap text-xs text-ink-500">
                {fmtDate(a.created_at)} {fmtTime(a.created_at)}
              </Td>
              <Td>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {a.action}
                </span>
              </Td>
              <Td className="text-xs">
                <p className="font-medium text-ink-900">{a.resource_type}</p>
                <p className="text-ink-500">{a.resource_id ? a.resource_id.slice(0, 8) + "…" : "—"}</p>
              </Td>
              <Td className="text-xs text-ink-500">{a.actor_id ? a.actor_id.slice(0, 8) + "…" : "system"}</Td>
              <Td className="max-w-[320px]">
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-brand-600 hover:text-brand-700">
                    View state diff
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-ink-700">
                    {JSON.stringify({ old: a.old_state, new: a.new_state }, null, 2)}
                  </pre>
                </details>
              </Td>
            </tr>
          ))}
        </TableShell>
      </DataView>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">Page {page}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || logs.loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ← Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext || logs.loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>
    </>
  );
}
