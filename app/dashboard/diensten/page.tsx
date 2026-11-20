import { requirePrincipal } from "@/lib/auth";
import { getMyWork } from "@/lib/dashboard/my-work";
import { weekSummary } from "@/lib/dashboard/week-summary";
import { MAX_WEEK_HOURS } from "@/lib/shifts/worker-overlap";
import { MyKlussenView } from "@/components/app/MyKlussenView";
import { PageHeader, money } from "@/components/app/ui";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MijnKlussenPage() {
  const principal = await requirePrincipal();
  const work = await getMyWork(principal.userId);
  const ft = await getFreelancerDict();
  // "Deze week: 3 klussen · 24 uur · € 432" — amber above the 60 hours of the Arbeidstijdenwet.
  const week = weekSummary([...work.active, ...work.hours, ...work.history]);
  const over = week.hours > MAX_WEEK_HOURS;

  return (
    <>
      <PageHeader title={ft.work.title}>
        {week.count > 0 && (
          <p className={`mt-3 text-sm ${over ? "font-semibold text-warn" : "text-neutralx-600"}`}>
            {ft.work.thisWeek(week.count)} · {ft.card.hours(new Intl.NumberFormat(ft.intl, { maximumFractionDigits: 1 }).format(week.hours))} ·{" "}
            <span className="num">{money(week.grossCents)}</span>
            {over ? ` · ${ft.work.weekOver}` : ""}
          </p>
        )}
      </PageHeader>

      <MyKlussenView work={work} />
    </>
  );
}
