import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerCalendarWeek, weekMaandag } from "@/lib/dashboard/employer-calendar";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { PlanningTabs } from "@/components/werkgever/PlanningTabs";
import { getDict } from "@/lib/i18n/server";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  FILLED: "bg-plan-soft text-plan-ink",
  IN_PROGRESS: "bg-plan-soft text-plan-ink",
  COMPLETED: "bg-paper-soft text-neutralx-500",
  PARTIALLY_FILLED: "bg-warn/10 text-warn",
  OPEN: "bg-warn/10 text-warn",
  MATCHING: "bg-warn/10 text-warn",
  DRAFT: "bg-paper-soft text-neutralx-500",
};

function parseMaandag(w: string | undefined): string {
  if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) return weekMaandag(w);
  return weekMaandag(amsterdamDayKey(new Date()));
}

export default async function WeekPage(props: { searchParams: Promise<{ w?: string }> }) {
  const searchParams = await props.searchParams;
  const principal = await requirePrincipal();
  const t = await getDict();
  const maandagKey = parseMaandag(searchParams.w);
  const week = await getEmployerCalendarWeek(principal, maandagKey);

  return (
    <>
      <PaginaKop
        title="Weekrooster"
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            {t.calendar.placeShift}
          </Link>
        }
      />
      <PlanningTabs actief="week" />

      <div className="mb-4 flex items-center justify-between">
        <Link href={`/werkgever/week?w=${week.prev}`} className="btn-ghost min-h-11 px-3 py-1.5 text-sm sm:min-h-0">
          ← {t.calendar.prev}
        </Link>
        <p className="font-display text-lg font-bold text-ink">
          {week.days[0]?.dayNum} – {week.days[6]?.dayNum}{" "}
          {t.calendar.months[new Date(week.days[6]?.dayKey ?? maandagKey + "T12:00:00Z").getUTCMonth()] ?? ""}
        </p>
        <Link href={`/werkgever/week?w=${week.next}`} className="btn-ghost min-h-11 px-3 py-1.5 text-sm sm:min-h-0">
          {t.calendar.next} →
        </Link>
      </div>

      {/* Op een brede scherm 7 kolommen, op een smalle scrollbaar opzij */}
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Weekrooster">
        <div className="min-w-[480px]">
          {/* Kolomhoofden */}
          <div className="grid grid-cols-7 gap-px rounded-t-xl border border-hair bg-hair text-center text-xs font-semibold text-neutralx-500">
            {week.days.map((d) => (
              <div
                key={d.dayKey}
                className={`py-2 ${d.isToday ? "bg-brand-50 text-brand-700" : "bg-paper-soft"}`}
              >
                {d.dayLabel}
              </div>
            ))}
          </div>
          {/* Dag-kolommen */}
          <div className="grid grid-cols-7 gap-px rounded-b-xl border-x border-b border-hair bg-hair">
            {week.days.map((d) => (
              <div
                key={d.dayKey}
                className={`min-h-[160px] min-w-0 p-1.5 sm:min-h-[200px] sm:p-2 ${d.isToday ? "bg-brand-50/30" : "bg-white"}`}
              >
                {d.shifts.length === 0 ? (
                  <p className="mt-2 text-center text-[10px] text-neutralx-400">–</p>
                ) : (
                  <div className="space-y-1">
                    {d.shifts.map((s) => (
                      <Link
                        key={s.id}
                        href={`/werkgever/diensten/${s.id}`}
                        className={`block truncate rounded px-1 py-1 text-[11px] font-medium sm:px-1.5 ${STATUS_TONE[s.status] ?? "bg-paper-soft text-neutralx-500"}`}
                        title={`${s.title} · ${s.branch} · ${s.filled}/${s.positions}`}
                      >
                        <span aria-hidden>
                          {new Date(s.startsAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}
                        </span>
                        {" "}{s.title}
                        {s.reacties > 0 && (
                          <span className="ml-1 rounded bg-warn/20 px-1 text-warn" aria-label={`${s.reacties} reacties`}>
                            {s.reacties}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
