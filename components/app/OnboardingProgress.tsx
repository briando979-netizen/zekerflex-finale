import Link from "next/link";

/**
 * Onboarding-voortgang: een klein ringetje met "X% — nog een paar stappen" dat
 * nieuwe freelancers de laatste stappen door trekt. Toont niets als het profiel
 * al compleet is. Puur presentatie — tekst wordt gelokaliseerd aangeleverd.
 */
export function OnboardingProgress({
  done,
  total,
  title,
  cta,
  href,
}: {
  done: number;
  total: number;
  title: string;
  cta: string;
  href: string;
}) {
  if (total <= 0 || done >= total) return null;
  const pct = Math.round((done / total) * 100);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <Link href={href} className="card mb-5 flex items-center gap-4 p-4 transition hover:bg-paper-soft">
      <div className="relative grid h-16 w-16 flex-shrink-0 place-items-center">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" stroke="currentColor" className="text-hair" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke="currentColor"
            className="text-brand-500"
            strokeDasharray={`${dash} ${circ}`}
          />
        </svg>
        <span className="absolute text-sm font-bold text-ink">{pct}%</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-neutralx-500">
          {done}/{total} · {cta} ›
        </p>
      </div>
    </Link>
  );
}
