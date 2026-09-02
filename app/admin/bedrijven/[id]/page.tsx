import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, EmptyState, StatusPill, dateTime, money } from "@/components/app/ui";
import { CompanyActions } from "@/components/admin/CompanyActions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Freelancer",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
  PLATFORM_ADMIN: "Platformbeheerder",
};

export default async function BedrijfDetailPage({ params }: { params: { id: string } }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />
      </div>
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      branches: { select: { id: true, name: true, city: true } },
      memberships: { include: { user: { select: { id: true, fullName: true, email: true, disabledAt: true } } } },
    },
  });

  if (!tenant) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Organisatie niet gevonden" subtitle={params.id} />
        <Link href="/admin/bedrijven" className="text-sm font-medium text-brand-600 hover:underline">
          ← Terug naar bedrijven
        </Link>
      </div>
    );
  }

  const [invoiceAgg, auditEntries] = await Promise.all([
    prisma.invoice.aggregate({
      where: { recipientTenantId: tenant.id, status: "PAID" },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.auditLog.findMany({
      where: { OR: [{ targetType: "tenant", targetId: tenant.id }, { targetType: "user", targetId: { in: tenant.memberships.map((m) => m.userId) } }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, category: true, action: true, summary: true, createdAt: true },
    }),
  ]);

  const hqAdmin = tenant.memberships.find((m) => m.role === "HQ_ADMIN")?.user;
  const blocked = tenant.memberships.length > 0 && tenant.memberships.every((m) => m.user.disabledAt);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/bedrijven" className="text-sm font-medium text-neutralx-500 hover:text-ink">
            ← Bedrijven
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">{tenant.name}</h1>
          <p className="mt-1 text-sm text-neutralx-600">
            {tenant.kvkNumber ? `KVK ${tenant.kvkNumber}` : "Geen KVK-nummer"} · {tenant.branches.length} vestiging
            {tenant.branches.length === 1 ? "" : "en"}
          </p>
          <div className="mt-2">
            <StatusPill tone={blocked ? "crit" : "ok"}>{blocked ? "geblokkeerd" : "actief"}</StatusPill>
          </div>
        </div>
        {hqAdmin && <CompanyActions tenantId={tenant.id} contactUserId={hqAdmin.id} blocked={blocked} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Vestigingen">
            {tenant.branches.length === 0 ? (
              <EmptyState title="Geen vestigingen" body="Deze organisatie heeft nog geen vestiging ingericht." />
            ) : (
              <ul className="divide-y divide-hair">
                {tenant.branches.map((b) => (
                  <li key={b.id} className="px-5 py-2.5 text-sm">
                    <span className="font-medium text-ink">{b.name}</span>
                    {b.city && <span className="text-neutralx-400"> · {b.city}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Auditspoor voor deze organisatie">
            {auditEntries.length === 0 ? (
              <EmptyState title="Nog niets vastgelegd" body="Er zijn nog geen gebeurtenissen." />
            ) : (
              <ul className="divide-y divide-hair">
                {auditEntries.map((e) => (
                  <li key={e.id} className="px-5 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="pill-neutral text-[10px]">{e.category}</span>
                      <span className="font-mono text-[11px] text-neutralx-400">{e.action}</span>
                    </div>
                    <p className="mt-0.5 text-ink-soft">{e.summary}</p>
                    <p className="text-[11px] text-neutralx-400">{dateTime(e.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Facturatie">
            <dl className="divide-y divide-hair text-sm">
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-neutralx-500">Betaalde facturen</dt>
                <dd className="font-medium text-ink">{invoiceAgg._count}</dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-neutralx-500">Totaal betaald</dt>
                <dd className="font-medium text-ink">{money(invoiceAgg._sum.totalCents ?? 0)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Gebruikers">
            {tenant.memberships.length === 0 ? (
              <EmptyState title="Geen gebruikers" body="Nog niemand gekoppeld aan deze organisatie." />
            ) : (
              <ul className="divide-y divide-hair">
                {tenant.memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/admin/gebruikers/${m.user.id}`} className="font-medium text-ink hover:text-brand-600">
                        {m.user.fullName}
                      </Link>
                      <p className="truncate text-xs text-neutralx-400">{ROLE_LABEL[m.role] ?? m.role}</p>
                    </div>
                    <StatusPill tone={m.user.disabledAt ? "crit" : "ok"}>
                      {m.user.disabledAt ? "geblokkeerd" : "actief"}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
