import { prisma } from "@/lib/prisma";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { AdminTwoFactorOverview } from "@/components/admin/AdminTwoFactorOverview";
import { twoFactorStatus } from "@/lib/auth/two-factor";

export const dynamic = "force-dynamic";

/** /admin/beveiliging — your own two-step verification + which admins and employer managers have it on. */
export default async function BeveiligingPage() {
  const principal = await requirePrincipal();
  const rows = await prisma.membership.findMany({
    where: { role: { in: ["PLATFORM_ADMIN", "HQ_ADMIN", "LOCAL_MANAGER"] }, user: { disabledAt: null } },
    select: { role: true, user: { select: { id: true, fullName: true, email: true } } },
    take: 500,
  });
  const byUser = new Map<string, { id: string; name: string; email: string; roles: string[] }>();
  for (const r of rows) {
    const cur = byUser.get(r.user.id) ?? { id: r.user.id, name: r.user.fullName, email: r.user.email, roles: [] };
    if (!cur.roles.includes(r.role)) cur.roles.push(r.role);
    byUser.set(r.user.id, cur);
  }
  const people = await Promise.all(
    [...byUser.values()].map(async (u) => ({ ...u, twoFactor: (await twoFactorStatus(u.id)).enabled })),
  );
  people.sort((a, b) => Number(a.twoFactor) - Number(b.twoFactor) || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Beveiliging & tweestapsverificatie" subtitle="Je eigen tweestapsverificatie, en wie van de beheerders en werkgevers het al aan heeft." />
      <section className="a-panel space-y-3 p-5">
        <h2 className="font-display text-lg font-semibold">Jouw account</h2>
        <TwoFactorSettings recommended />
      </section>
      <AdminTwoFactorOverview people={people} selfId={principal.userId} />
    </div>
  );
}
