import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getMyWork, type MyWorkItem } from "@/lib/dashboard/my-work";
import { EmptyState } from "@/components/app/ui";
import { KlusChip, ShiftCard } from "@/components/app/ShiftCard";
import { getFreelancerDict } from "@/lib/i18n/server";
import type { FreelancerDict } from "@/lib/i18n/freelancer";

export const dynamic = "force-dynamic";

// "Uren invullen" (21 nov 2026, de opzet van YoungOnes): de kop staat in de balk bovenaan (FreelancerShell); leeg is
// één zin ("Zodra je een klus hebt uitgevoerd kun je hier jouw gewerkte uren invullen"). De afgelopen klussen staan
// als volledige kluskaart met de status van het urenbriefje als chip (concept / ingediend / betwist). Zodra je indient
// blijft de kaart hier staan; pas na goedkeuring verhuist de klus naar Mijn klussen → Gearchiveerd
// (lib/dashboard/my-work.ts).
export default async function UrenInvullenPage() {
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const H = ft.hoursPage;
  const { hours } = await getMyWork(principal.userId);

  if (hours.length === 0) {
    return <EmptyState icon="⏱️" title={H.emptyTitle} body={H.emptyBody} cta={{ href: "/dashboard/klussen", label: ft.work.emptyCta }} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {hours.map((item) => (
        <ShiftCard
          key={item.workKey}
          shift={item.shift}
          t={ft}
          href={item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren"}
          footerOverride={<HoursFooter item={item} ft={ft} />}
        />
      ))}
    </div>
  );
}

// de status als chip links, de volgende stap rechts (concept en betwist: naar het urenbriefje)
function HoursFooter({ item, ft }: { item: MyWorkItem; ft: FreelancerDict }) {
  const w = ft.work;
  const H = ft.hoursPage;
  const href = item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren";

  if (item.timesheetStatus === "SUBMITTED") {
    return (
      <div className="flex items-center justify-between gap-3">
        <KlusChip tone="blue">{H.statusSubmitted}</KlusChip>
        <span className="text-xs font-semibold text-plan-ink">{w.submitted}</span>
      </div>
    );
  }
  if (item.timesheetStatus === "DISPUTED") {
    return (
      <div className="flex items-center justify-between gap-3">
        <KlusChip tone="red">{H.statusDisputed}</KlusChip>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-warn">
          {w.disputed} <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }
  // DRAFT → vul je uren in
  return (
    <div className="flex items-center justify-between gap-3">
      <KlusChip tone="amber">{H.statusDraft}</KlusChip>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-warn">
        {w.fillHours} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
