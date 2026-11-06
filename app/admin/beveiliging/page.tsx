import { prisma } from "@/lib/prisma";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { KpiStrip, PageHead, Panel } from "@/components/admin/kit";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { AdminTwoFactorOverview } from "@/components/admin/AdminTwoFactorOverview";
import { AanvalsbeschermingPanel } from "@/components/admin/AanvalsbeschermingPanel";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { count, percentOf } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

/** /admin/beveiliging — your own two-step verification; platform admins also see who else has it on, and what the attack protection (CrowdSec) is blocking. */
export default async function BeveiligingPage() {
  const principal = await requirePrincipal();
  const isPlatformAdmin = hasRole(principal, "PLATFORM_ADMIN");

  const own = (
    <Panel title="Jouw account" subtitle="Tweestapsverificatie voor je eigen inlog">
      <TwoFactorSettings recommended />
    </Panel>
  );

  if (!isPlatformAdmin) {
    return (
      <div className="space-y-4">
        <PageHead title="Beveiliging" subtitle="Je eigen tweestapsverificatie." />
        {own}
      </div>
    );
  }

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
    // één mislukte KV-lezing mag de hele pagina niet omgooien
    [...byUser.values()].map(async (u) => ({ ...u, twoFactor: await twoFactorStatus(u.id).then((s) => s.enabled).catch(() => false) })),
  );
  people.sort((a, b) => Number(a.twoFactor) - Number(b.twoFactor) || a.name.localeCompare(b.name));

  const on = people.filter((p) => p.twoFactor).length;
  const admins = people.filter((p) => p.roles.includes("PLATFORM_ADMIN"));
  const adminsOn = admins.filter((p) => p.twoFactor).length;

  return (
    <div className="space-y-4">
      <PageHead title="Beveiliging" subtitle="Je eigen tweestapsverificatie, wie van de beheerders en werkgevers het al aan heeft, en wat de aanvalsbescherming op de server tegenhoudt." />
      <KpiStrip
        items={[
          { label: "Tweestaps aan", value: `${percentOf(on, people.length)}%`, hint: `${count(on)} van ${count(people.length)} mensen`, tone: on === people.length ? "ok" : "warn" },
          { label: "Platformbeheerders", value: `${count(adminsOn)} van ${count(admins.length)}`, hint: "hebben het aan", tone: adminsOn === admins.length ? "ok" : "crit" },
          { label: "Nog niet aan", value: count(people.length - on), hint: "beheerders en werkgevers" },
        ]}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
        {own}
        <AdminTwoFactorOverview people={people} selfId={principal.userId} />
      </div>
      <AanvalsbeschermingPanel />
    </div>
  );
}
