import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getMyWork, type MyWorkItem } from "@/lib/dashboard/my-work";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { ShiftCard } from "@/components/app/ShiftCard";
import { getFreelancerDict } from "@/lib/i18n/server";
import type { FreelancerDict } from "@/lib/i18n/freelancer";

export const dynamic = "force-dynamic";

// De "Uren"-pagina toont de afgelopen klussen als volledige shiftkaart — net als
// bij Mijn klussen, maar met een eigen actie: vul je uren in. Zodra je indient
// blijft de kaart hier staan met status "ingediend"; pas na goedkeuring verhuist
// de klus naar Mijn klussen → Gearchiveerd (lib/dashboard/my-work.ts).
export default async function UrenInvullenPage() {
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const H = ft.hoursPage;
  const { hours } = await getMyWork(principal.userId);

  const toFill = hours.filter((h) => h.timesheetStatus === "DRAFT").length;

  return (
    <>
      <PageHeader title={H.title} eyebrow={H.eyebrow} subtitle={H.subtitle} />

      {hours.length === 0 ? (
        <EmptyState title={H.emptyTitle} body={H.emptyBody} />
      ) : (
        <>
          <p className="mb-4 text-sm font-semibold text-neutralx-600">{H.toFill(toFill)}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {hours.map((item) => (
              <ShiftCard
                key={item.workKey}
                shift={item.shift}
                t={ft}
                href={item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren"}
                footerOverride={<HoursFooter item={item} w={ft.work} />}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function HoursFooter({ item, w }: { item: MyWorkItem; w: FreelancerDict["work"] }) {
  if (item.timesheetStatus === "SUBMITTED") {
    return (
      <div className="rounded-xl bg-plan-soft px-3 py-2.5 text-sm font-semibold text-plan-ink">{w.submitted}</div>
    );
  }
  if (item.timesheetStatus === "DISPUTED") {
    return (
      <Link
        href={item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren"}
        className="flex items-center justify-between rounded-xl bg-warn/10 px-3 py-2.5 text-sm font-semibold text-warn"
      >
        <span>{w.disputed}</span>
        <span aria-hidden>→</span>
      </Link>
    );
  }
  // DRAFT → vul je uren in
  return (
    <Link
      href={item.timesheetId ? `/dashboard/uren/${item.timesheetId}` : "/dashboard/uren"}
      className="flex items-center justify-between rounded-xl bg-warn/10 px-3 py-2.5 text-sm font-semibold text-warn"
    >
      <span>{w.fillHours}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}
