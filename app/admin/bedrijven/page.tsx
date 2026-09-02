import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, EmptyState, dateShort } from "@/components/app/ui";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  PLATFORM: "Platform",
  ENTERPRISE_HQ: "Hoofdkantoor",
  FRANCHISE: "Franchise",
};

export default async function BedrijvenPage({ searchParams }: { searchParams: { q?: string } }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Geen toegang" subtitle="Het bedrijvenoverzicht is alleen voor platformbeheerders." />
      </div>
    );
  }

  const q = searchParams.q?.trim() ?? "";
  const tenants = await prisma.tenant.findMany({
    where: {
      type: { not: "PLATFORM" },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      name: true,
      type: true,
      kvkNumber: true,
      createdAt: true,
      _count: { select: { branches: true, memberships: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Bedrijven" subtitle="Alle organisaties die als opdrachtgever op ZekerFlex actief zijn." />

      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Zoek op bedrijfsnaam…"
          className="w-72 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm"
        />
        <button type="submit" className="btn-ghost text-sm">
          Zoeken
        </button>
      </form>

      <Panel title={`${tenants.length} organisatie${tenants.length === 1 ? "" : "s"}`}>
        {tenants.length === 0 ? (
          <EmptyState title="Geen bedrijven gevonden" body="Pas je zoekopdracht aan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Organisatie</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">KVK</th>
                  <th className="px-5 py-2.5 font-medium">Vestigingen</th>
                  <th className="px-5 py-2.5 font-medium">Gebruikers</th>
                  <th className="px-5 py-2.5 text-right font-medium">Aangemeld</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-paper-soft">
                    <td className="px-5 py-3">
                      <Link href={`/admin/bedrijven/${t.id}`} className="font-medium text-ink hover:text-brand-600">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">{TYPE_LABEL[t.type] ?? t.type}</td>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{t.kvkNumber ?? "—"}</td>
                    <td className="px-5 py-3 text-neutralx-600">{t._count.branches}</td>
                    <td className="px-5 py-3 text-neutralx-600">{t._count.memberships}</td>
                    <td className="px-5 py-3 text-right text-neutralx-600">{dateShort(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
