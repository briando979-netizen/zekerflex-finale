import Link from "next/link";
import type { PublicShift } from "@/lib/public-shifts";

const TZ = "Europe/Amsterdam";
const day = (d: Date) => d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const time = (d: Date) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const rate = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Open klussen as a plain, crawlable list (server-rendered links, no JS needed). */
export function PublicShiftList({ shifts, empty }: { shifts: PublicShift[]; empty: string }) {
  if (shifts.length === 0) {
    return <p className="rounded-2xl border border-hair bg-white p-6 text-sm text-neutralx-600">{empty}</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {shifts.map((s) => (
        <li key={s.id}>
          <Link
            href={`/klussen/${s.id}`}
            className="block h-full rounded-2xl border border-hair bg-white p-5 transition hover:border-brand-500 hover:shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-base font-bold leading-snug text-ink">{s.title}</h3>
              <span className="whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                {rate(s.hourlyRateCents)}/uur
              </span>
            </div>
            <p className="mt-1 text-sm text-neutralx-600">
              {s.company} · {s.city}
            </p>
            <p className="mt-3 text-xs text-neutralx-500">
              {day(s.startsAt)} · {time(s.startsAt)}–{time(s.endsAt)}
              {s.positions > 1 ? ` · ${s.positions} plekken` : ""}
              {s.viaUitzendbureau ? " · via uitzendbureau, geen KVK nodig" : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
