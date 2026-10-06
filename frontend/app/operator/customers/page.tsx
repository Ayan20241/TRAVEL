"use client";
import Link from "next/link";
import { TripFull, Profile, useApi, DataView, TableShell, Td } from "../_shared";
import { PageHeader } from "@/components/ui";

export default function CustomersPage() {
  const users = useApi<Profile[]>(`/api/v1/users?role=TRAVELER&page_size=100`);
  const trips = useApi<TripFull[]>(`/api/v1/trips?page_size=100`);

  const counts = new Map<string, number>();
  for (const t of trips.data ?? []) counts.set(t.traveler_id, (counts.get(t.traveler_id) ?? 0) + 1);
  const customers = users.data ?? [];

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} registered travelers on the platform.`}
      />
      <DataView
        loading={users.loading || trips.loading}
        error={users.error || trips.error}
        empty={customers.length === 0}
        onRetry={() => { users.refetch(); trips.refetch(); }}
        emptyTitle="No customers yet"
        emptyHint="Travelers who register on the platform will appear here."
      >
        <TableShell head={["Customer", "Contact", "Trips", ""]}>
          {customers.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td>
                <p className="font-semibold text-ink-900">{c.full_name || "—"}</p>
                <p className="text-xs text-ink-500">{c.email}</p>
              </Td>
              <Td>{c.phone || "—"}</Td>
              <Td>
                <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                  {counts.get(c.id) ?? 0} trip{(counts.get(c.id) ?? 0) === 1 ? "" : "s"}
                </span>
              </Td>
              <Td className="text-right">
                <Link href="/operator/trips" className="font-semibold text-brand-600 hover:text-brand-700">
                  View trips →
                </Link>
              </Td>
            </tr>
          ))}
        </TableShell>
      </DataView>
    </>
  );
}
