import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getEmployerCalendarMonth } from "@/lib/dashboard/employer-calendar";
import { PageHeader } from "@/components/app/ui";
import { getDict, getLocale } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  FILLED: "bg-ok/10 text-ok",
  IN_PROGRESS: "bg-ok/10 text-ok",
  COMPLETED: "bg-paper-soft text-neutralx-500",
  PARTIALLY_FILLED: "bg-warn/10 text-warn",
  OPEN: "bg-warn/10 text-warn",
  MATCHING: "bg-warn/10 text-warn",
  DRAFT: "bg-paper-soft text-neutralx-500",
};

function parseMonth(m: string | undefined): { y: number; mo: number } {
  const now = new Date();
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number) as [number, number];
    if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) return { y, mo: mo - 1 };
  }
  return { y: now.getFullYear(), mo: now.getMonth() };
}

const key = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const principal = await requirePrincipal();
  const t = getDict();
  const localeTag = getLocale() === "en" ? "en-GB" : "nl-NL";
  const { y, mo } = parseMonth(searchParams.m);
  const cal = await getEmployerCalendarMonth(principal, y, mo);

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        eyebrow={t.calendar.eyebrow}
        subtitle={fmt(cal.total === 1 ? t.calendar.subtitleOne : t.calendar.subtitle, {
          n: cal.total,
          month: cal.label.toLowerCase(),
        })}
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            {t.calendar.placeShift}
          </Link>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/werkgever/kalender?m=${key(cal.prev.y, cal.prev.m)}`}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          ← {t.calendar.prev}
        </Link>
        <p className="font-display text-lg font-bold text-ink">{cal.label}</p>
        <Link
          href={`/werkgever/kalender?m=${key(cal.next.y, cal.next.m)}`}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          {t.calendar.next} →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-px rounded-t-xl border border-hair bg-hair text-center text-xs font-semibold uppercase tracking-wide text-neutralx-500">
            {t.calendar.weekdays.map((d) => (
              <div key={d} className="bg-paper-soft py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-b-xl border-x border-b border-hair bg-hair">
            {cal.weeks.flat().map((cell, i) => (
              <div
                key={i}
                className={`min-h-[104px] bg-white p-1.5 ${cell.inMonth ? "" : "bg-paper-soft/60"}`}
              >
                <div
                  className={`mb-1 text-right text-xs ${
                    cell.isToday
                      ? "mx-auto grid h-5 w-5 place-items-center rounded-full bg-brand-500 font-bold text-white"
                      : cell.inMonth
                        ? "text-neutralx-500"
                        : "text-neutralx-400/60"
                  }`}
                >
                  {cell.date.getDate()}
                </div>
                <div className="space-y-1">
                  {cell.shifts.slice(0, 3).map((s) => (
                    <Link
                      key={s.id}
                      href={`/werkgever/diensten/${s.id}`}
                      className={`block truncate rounded px-1.5 py-1 text-[11px] font-medium ${
                        STATUS_TONE[s.status] ?? "bg-paper-soft text-neutralx-500"
                      }`}
                      title={`${s.title} · ${s.branch} · ${s.filled}/${s.positions}`}
                    >
                      {s.startsAt.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })} {s.title}
                    </Link>
                  ))}
                  {cell.shifts.length > 3 && (
                    <p className="px-1.5 text-[10px] text-neutralx-400">{fmt(t.calendar.more, { n: cell.shifts.length - 3 })}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutralx-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warn/40" /> {t.calendar.legendOpen}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-ok/40" /> {t.calendar.legendFilled}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-hairstrong" /> {t.calendar.legendDone}</span>
      </div>
    </>
  );
}
