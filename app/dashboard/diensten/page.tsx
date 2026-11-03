import { requirePrincipal } from "@/lib/auth";
import { getMyWork } from "@/lib/dashboard/my-work";
import { weekSummary } from "@/lib/dashboard/week-summary";
import { MAX_WEEK_HOURS } from "@/lib/shifts/worker-overlap";
import { MyKlussenView } from "@/components/app/MyKlussenView";
import { money } from "@/components/app/ui";
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
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          {ft.work.title}
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        {week.count > 0 && (
          <p className={`mt-3 text-sm ${over ? "font-semibold text-warn" : "text-neutralx-600"}`}>
            {ft.work.thisWeek(week.count)} · {ft.card.hours(new Intl.NumberFormat(ft.intl, { maximumFractionDigits: 1 }).format(week.hours))} ·{" "}
            <span className="num">{money(week.grossCents)}</span>
            {over ? ` · ${ft.work.weekOver}` : ""}
          </p>
        )}
      </div>

      <MyKlussenView work={work} />
    </>
  );
}
