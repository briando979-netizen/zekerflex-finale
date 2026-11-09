import Link from "next/link";
import type { Stap, Voortgang } from "@/lib/onboarding/voortgang";

export interface OnboardingProgressTexts {
  title: string;
  sub: (nog: number, totaal: number, min: number) => string;
  stepOf: (n: number, totaal: number) => string;
  minutes: (min: number) => string;
  optional: string;
  start: string;
}

/**
 * "Maak je profiel af": ring met voortgang, de eerstvolgende stap met uitleg
 * waarom we hem vragen, en de overige openstaande stappen. Gevoed door echte
 * gegevens (lib/onboarding/voortgang.ts); toont alleen wat nog open staat en
 * verdwijnt zodra alles klaar is. Puur presentatie: de teksten komen
 * gelokaliseerd van de pagina (werker: vijf talen, werkgever: Nederlands).
 */
export function OnboardingProgress({
  voortgang,
  steps,
  texts,
}: {
  voortgang: Voortgang;
  steps: Record<string, { title: string; why: string }>;
  texts: OnboardingProgressTexts;
}) {
  const { done, total, pct, open, volgende, minutenOpen } = voortgang;
  if (open.length === 0 || !volgende) return null;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const rest = open.filter((s) => s.key !== volgende.key);
  const tekst = (s: Stap) => steps[s.key];
  const eerste = tekst(volgende);
  const nogVerplicht = open.filter((s) => !s.optioneel).length;

  return (
    <section className="card relative mb-5 p-4" aria-label={texts.title}>
      <div className="flex items-center gap-4">
        <div className="relative grid h-16 w-16 flex-shrink-0 place-items-center">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90" aria-hidden>
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
          <h2 className="text-sm font-semibold text-ink">{texts.title}</h2>
          <p className="mt-0.5 text-xs text-neutralx-500">
            {nogVerplicht > 0 ? texts.sub(nogVerplicht, total, minutenOpen) : texts.optional}
          </p>
        </div>
      </div>

      {eerste && (
        <div className="mt-4 rounded-xl border border-warn/30 bg-warn/5 p-3">
          <p className="text-xs font-medium text-neutralx-500">
            {volgende.optioneel ? texts.optional : texts.stepOf(Math.min(done + 1, total), total)} · {texts.minutes(volgende.minuten)}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{eerste.title}</p>
          <p className="mt-1 text-xs text-neutralx-600">{eerste.why}</p>
          <Link href={volgende.href} className="btn-primary mt-3 inline-flex">
            {texts.start}
          </Link>
        </div>
      )}

      {rest.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rest.map((s) => {
            const x = tekst(s);
            if (!x) return null;
            return (
              <li key={s.key}>
                <Link href={s.href} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm text-neutralx-600 hover:bg-paper-soft">
                  <span className="h-4 w-4 flex-shrink-0 rounded-full border border-hairstrong" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <span className="flex-shrink-0 text-xs text-neutralx-400">
                    {s.optioneel ? texts.optional : texts.minutes(s.minuten)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
