import type { TodayShift } from "@/lib/dashboard/today";

/**
 * "Vandaag"-strip bovenaan het freelancer-dashboard: de diensten die je
 * vandaag zelf hebt. Server-component. Tijd in Europe/Amsterdam (NL-platform).
 */
function hhmm(d: Date): string {
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
}

export function TodayStrip({
  shifts,
  labels,
}: {
  shifts: TodayShift[];
  labels: { todayLabel: string; todayAt: string; todayAtPlace: string };
}) {
  if (shifts.length === 0) return null;
  return (
    <div className="card mb-5 border-brand-200 bg-brand-50/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{labels.todayLabel}</p>
      <ul className="mt-2 space-y-1.5">
        {shifts.map((s) => (
          <li key={s.id} className="text-sm text-ink">
            <span className="font-medium">{s.title}</span>
            <span className="text-neutralx-500">
              {" "}
              {labels.todayAt} {hhmm(s.startsAt)}
              {s.branchName ? (
                <>
                  {" "}
                  {labels.todayAtPlace} {s.branchName}
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
