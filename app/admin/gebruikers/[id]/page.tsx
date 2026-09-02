import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, EmptyState, StatusPill, dateTime, money } from "@/components/app/ui";
import { UserActions } from "@/components/admin/UserActions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Freelancer",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
  PLATFORM_ADMIN: "Platformbeheerder",
};

export default async function GebruikerDetailPage({ params }: { params: { id: string } }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      memberships: { include: { tenant: { select: { id: true, name: true } } } },
      freelancerProfile: true,
      identityChecks: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Gebruiker niet gevonden" subtitle={params.id} />
        <Link href="/admin/gebruikers" className="text-sm font-medium text-brand-600 hover:underline">
          ← Terug naar gebruikers
        </Link>
      </div>
    );
  }

  const [auditEntries, approvedCount, disputesRaised, payoutTotal] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ actorUserId: user.id }, { targetType: "user", targetId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, category: true, action: true, severity: true, summary: true, createdAt: true },
    }),
    prisma.timesheet.count({ where: { approvedById: user.id } }),
    prisma.dispute.count({ where: { raisedById: user.id } }),
    prisma.invoice.aggregate({
      where: { issuerFreelancerId: user.freelancerProfile?.id ?? "__none__", status: "PAID" },
      _sum: { totalCents: true },
    }),
  ]);

  const isDeleted = user.email.endsWith("@verwijderd.zekerflex.invalid");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/gebruikers" className="text-sm font-medium text-neutralx-500 hover:text-ink">
            ← Gebruikers
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">{user.fullName}</h1>
          <p className="mt-1 text-sm text-neutralx-600">{user.email}{user.phone ? ` · ${user.phone}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone={user.disabledAt ? "crit" : "ok"}>{user.disabledAt ? "geblokkeerd" : "actief"}</StatusPill>
            <StatusPill tone={user.emailVerifiedAt ? "ok" : "warn"}>
              {user.emailVerifiedAt ? "e-mail geverifieerd" : "e-mail niet geverifieerd"}
            </StatusPill>
            <StatusPill tone={user.kycStatus === "VERIFIED" ? "ok" : "neutral"}>KYC: {user.kycStatus}</StatusPill>
          </div>
        </div>
        {!isDeleted && <UserActions userId={user.id} blocked={Boolean(user.disabledAt)} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Rollen & organisaties">
            {user.memberships.length === 0 ? (
              <EmptyState title="Geen rol" body="Deze gebruiker heeft nog geen membership." />
            ) : (
              <ul className="divide-y divide-hair">
                {user.memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium text-ink">{ROLE_LABEL[m.role] ?? m.role}</span>
                    {m.tenant && (
                      <Link href={`/admin/bedrijven/${m.tenant.id}`} className="text-brand-600 hover:underline">
                        {m.tenant.name} →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Auditspoor voor deze gebruiker">
            {auditEntries.length === 0 ? (
              <EmptyState title="Nog niets vastgelegd" body="Er zijn nog geen gebeurtenissen voor dit account." />
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
          <Panel title="Kerncijfers">
            <dl className="divide-y divide-hair text-sm">
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-neutralx-500">Lid sinds</dt>
                <dd className="font-medium text-ink">{dateTime(user.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-neutralx-500">Laatst ingelogd</dt>
                <dd className="font-medium text-ink">{user.lastLoginAt ? dateTime(user.lastLoginAt) : "nooit"}</dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-neutralx-500">Uren goedgekeurd (als manager)</dt>
                <dd className="font-medium text-ink">{approvedCount}</dd>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-neutralx-500">Disputen ingediend</dt>
                <dd className="font-medium text-ink">{disputesRaised}</dd>
              </div>
              {user.freelancerProfile && (
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-neutralx-500">Totaal uitbetaald</dt>
                  <dd className="font-medium text-ink">{money(payoutTotal._sum.totalCents ?? 0)}</dd>
                </div>
              )}
            </dl>
          </Panel>

          {user.freelancerProfile && (
            <Panel title="Freelancerprofiel">
              <dl className="divide-y divide-hair text-sm">
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-neutralx-500">KVK</dt>
                  <dd className="font-medium text-ink">
                    {user.freelancerProfile.kvkNumber ?? "—"}{" "}
                    {user.freelancerProfile.kvkValid ? "✓" : user.freelancerProfile.kvkNumber ? "!" : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-neutralx-500">IBAN</dt>
                  <dd className="font-medium text-ink">{user.freelancerProfile.payoutIban ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-neutralx-500">Fiscale gegevens</dt>
                  <dd>
                    <Link href="/admin/fiscaal" className="text-brand-600 hover:underline">
                      Openen in Werkvormen & btw →
                    </Link>
                  </dd>
                </div>
              </dl>
            </Panel>
          )}

          <Panel title="Identiteitscontroles">
            {user.identityChecks.length === 0 ? (
              <EmptyState title="Geen controles" body="Er is nog geen identiteitscheck gestart." />
            ) : (
              <ul className="divide-y divide-hair text-sm">
                {user.identityChecks.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-ink-soft">{c.provider}</span>
                    <StatusPill tone={c.status === "VERIFIED" ? "ok" : c.status === "REJECTED" ? "crit" : "warn"}>
                      {c.status}
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
