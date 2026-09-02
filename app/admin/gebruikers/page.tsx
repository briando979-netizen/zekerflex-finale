import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, EmptyState, StatusPill, dateShort } from "@/components/app/ui";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Freelancer",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
  PLATFORM_ADMIN: "Platformbeheerder",
};

const STATUS_TABS = [
  { key: "", label: "Alle" },
  { key: "active", label: "Actief" },
  { key: "blocked", label: "Geblokkeerd" },
];

export default async function GebruikersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Geen toegang" subtitle="Het gebruikersoverzicht is alleen voor platformbeheerders." />
      </div>
    );
  }

  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "";

  const [users, totals] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(status === "active" ? { disabledAt: null } : status === "blocked" ? { disabledAt: { not: null } } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        kycStatus: true,
        disabledAt: true,
        lastLoginAt: true,
        emailVerifiedAt: true,
        createdAt: true,
        memberships: { select: { role: true, tenant: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { disabledAt: { not: null } } }),
      prisma.user.count({ where: { memberships: { some: { role: "FREELANCER" } } } }),
      prisma.user.count({ where: { memberships: { some: { role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] } } } } }),
    ]),
  ]);

  const [total, blocked, freelancers, employers] = totals;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Gebruikers"
        subtitle="Iedereen die een account heeft op ZekerFlex — freelancers, werkgevers en beheerders."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Totaal", total],
          ["Freelancers", freelancers],
          ["Werkgevers", employers],
          ["Geblokkeerd", blocked],
        ].map(([l, n]) => (
          <div key={l as string} className="card p-4">
            <p className="text-xs text-neutralx-500">{l}</p>
            <p className="num mt-1 text-2xl font-bold text-ink">{n}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/gebruikers?${new URLSearchParams({ ...(q ? { q } : {}), ...(t.key ? { status: t.key } : {}) }).toString()}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === t.key ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Zoek op naam of e-mail…"
            className="w-64 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm"
          />
          <button type="submit" className="btn-ghost text-sm">
            Zoeken
          </button>
        </form>
      </div>

      <Panel title={`${users.length} gebruiker${users.length === 1 ? "" : "s"}`}>
        {users.length === 0 ? (
          <EmptyState title="Geen gebruikers gevonden" body="Pas je zoekopdracht of filter aan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Naam</th>
                  <th className="px-5 py-2.5 font-medium">Rol / organisatie</th>
                  <th className="px-5 py-2.5 font-medium">KYC</th>
                  <th className="px-5 py-2.5 font-medium">Laatst ingelogd</th>
                  <th className="px-5 py-2.5 font-medium">Lid sinds</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-paper-soft">
                    <td className="px-5 py-3">
                      <Link href={`/admin/gebruikers/${u.id}`} className="font-medium text-ink hover:text-brand-600">
                        {u.fullName}
                      </Link>
                      <p className="text-xs text-neutralx-400">
                        {u.email} {!u.emailVerifiedAt && "· niet geverifieerd"}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {u.memberships.length === 0
                        ? "—"
                        : u.memberships
                            .map((m) => `${ROLE_LABEL[m.role] ?? m.role}${m.tenant ? ` · ${m.tenant.name}` : ""}`)
                            .join(", ")}
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">{u.kycStatus}</td>
                    <td className="px-5 py-3 text-neutralx-600">{u.lastLoginAt ? dateShort(u.lastLoginAt) : "nooit"}</td>
                    <td className="px-5 py-3 text-neutralx-600">{dateShort(u.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={u.disabledAt ? "crit" : "ok"}>{u.disabledAt ? "geblokkeerd" : "actief"}</StatusPill>
                    </td>
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
