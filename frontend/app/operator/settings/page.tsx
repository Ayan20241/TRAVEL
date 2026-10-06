"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { useAuth } from "@/components/AuthProvider";
import { Profile, Role, useApi, DataView, TableShell, Td, StatusBadge, ConfirmDialog } from "../_shared";
import { PageHeader, Card, Select, Label } from "@/components/ui";

const ROLES: Role[] = ["TRAVELER", "OPERATOR", "COORDINATOR", "VENDOR", "ADMIN"];

export default function SettingsPage() {
  const { profile } = useAuth();
  const [roleFilter, setRoleFilter] = useState("");
  const users = useApi<Profile[]>(`/api/v1/users${roleFilter ? `?role=${roleFilter}` : ""}&page_size=100`.replace("?&", "?"));
  const [target, setTarget] = useState<Profile | null>(null);
  const [newRole, setNewRole] = useState<Role>("TRAVELER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isAdmin = profile?.role === "ADMIN";
  const list = users.data ?? [];

  const askChange = (u: Profile) => {
    setTarget(u);
    setNewRole(u.role);
    setErr(null);
  };

  const doChange = async () => {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/v1/users/${target.id}/role`, { method: "PATCH", body: { role: newRole } });
      setTarget(null);
      users.refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Role change failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Platform users, roles, and deployment configuration." />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink-900">Users & roles</h2>
          <div className="w-48">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
        </div>
        {!isAdmin && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
            Role changes are restricted to <strong>ADMIN</strong> users. You are signed in as{" "}
            <strong>{profile?.role}</strong>, so you can view users but not change roles.
          </div>
        )}
        <DataView
          loading={users.loading}
          error={users.error}
          empty={list.length === 0}
          onRetry={users.refetch}
          emptyTitle="No users found"
        >
          <TableShell head={["User", "Role", isAdmin ? "Change role" : ""]}>
            {list.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td>
                  <p className="font-semibold text-ink-900">{u.full_name || "—"}</p>
                  <p className="text-xs text-ink-500">{u.email}</p>
                </Td>
                <Td>
                  <StatusBadge value={u.role} />
                </Td>
                {isAdmin && (
                  <Td>
                    <button className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => askChange(u)}>
                      Change…
                    </button>
                  </Td>
                )}
              </tr>
            ))}
          </TableShell>
        </DataView>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-bold text-ink-900">Deployment checklist</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-bold text-ink-900">Frontend (Vercel)</h3>
            <ul className="space-y-1.5 text-sm text-ink-700">
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> — your Supabase project URL</li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — Supabase anon (publishable) key</li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_BACKEND_URL</code> — production backend URL (no localhost)</li>
            </ul>
            <p className="mt-3 text-xs text-ink-500">
              Build with <code className="rounded bg-slate-100 px-1">npm run build</code>. Add the production domain to the
              backend&apos;s CORS allow-list and to Supabase Auth redirect URLs.
            </p>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-bold text-ink-900">Backend (Render / container)</h3>
            <ul className="space-y-1.5 text-sm text-ink-700">
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">SUPABASE_URL</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">SUPABASE_ANON_KEY</code></li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> — backend only, never in the browser</li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">DATABASE_URL</code> — Supabase Postgres (pooler URL in production)</li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">BACKEND_ENV=production</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">CORS_ORIGINS</code> — frontend domain(s)</li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">AI_PROVIDER</code> / <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">AI_API_KEY</code> — optional; engines work deterministically without AI</li>
            </ul>
            <p className="mt-3 text-xs text-ink-500">
              Health checks: <code className="rounded bg-slate-100 px-1">GET /health</code> and <code className="rounded bg-slate-100 px-1">GET /api/v1/health</code>.
              Full template lives in <code className="rounded bg-slate-100 px-1">.env.example</code> at the repo root.
            </p>
          </Card>
          <Card className="lg:col-span-2">
            <h3 className="mb-2 text-sm font-bold text-ink-900">Supabase</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-700">
              <li>Run the migrations in <code className="rounded bg-slate-100 px-1 text-xs">backend/alembic</code> (or the SQL in <code className="rounded bg-slate-100 px-1 text-xs">backend/supabase</code>) against the production project so RLS policies are in place.</li>
              <li>In <strong>Authentication → URL Configuration</strong>, add the production frontend URL (e.g. <code className="rounded bg-slate-100 px-1 text-xs">https://your-app.vercel.app</code>) to <strong>Site URL</strong> and <strong>Redirect URLs</strong>, plus <code className="rounded bg-slate-100 px-1 text-xs">http://localhost:3000</code> for local development.</li>
              <li>Never expose <code className="rounded bg-slate-100 px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> to the browser — the frontend uses only the anon key and the user&apos;s JWT.</li>
            </ul>
          </Card>
        </div>
      </section>

      <ConfirmDialog
        open={!!target}
        title="Change user role?"
        body={target ? `${target.email}: ${target.role} → ${newRole}. This changes what they can access immediately.` : undefined}
        confirmLabel="Change role"
        danger={newRole === "ADMIN" || target?.role === "ADMIN"}
        busy={busy}
        onConfirm={doChange}
        onCancel={() => setTarget(null)}
      />
      {err && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {err} <button onClick={() => setErr(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
    </>
  );
}
