import { RETENTION_RULES, erasableNow } from "@/lib/privacy/retention";
import { vulIn } from "@/lib/i18n/vul-in";
import { ERASURE_NL as NL, type ErasureTeksten } from "@/components/privacy/erasure-texts";

/** De vaste teksten (components/privacy/erasure-texts.ts); Nederlands is de standaard, de werker-app geeft zijn eigen taal mee. */
export type { ErasureTeksten };

const YEARS = (days: number) => Math.round(days / 365);
/** alleen de eerste letter klein: "art. 52 AWR" en "Wet DBA" blijven leesbaar */
const klein = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Shared explanation of what an AVG art. 17 erasure clears immediately vs.
// what Dutch tax/Wet DBA law forces us to keep a while longer — used on both
// the public deletion-confirmation page and the in-app self-service page, so
// the two never drift from the real retention schedule in lib/privacy/retention.ts.
// 16 nov 2026: de omschrijvingen per soort komen in de taal van de app mee (wisOnderdelen/wisGronden); zonder die teksten de
// Nederlandse uit lib/privacy/retention.ts.
// `verberg`: sleutels die dit scherm niet noemt (de verwijderpagina van een bedrijf: producten die weg zijn).
export function ErasureScopeInfo({ texts = NL, verberg = [] }: { texts?: ErasureTeksten; verberg?: readonly string[] }) {
  const cleared = erasableNow().filter((r) => !verberg.includes(r.key));
  const retained = RETENTION_RULES.filter((r) => r.blocksErasure && !verberg.includes(r.key));

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold text-ink">{texts.wisNu}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
          {cleared.map((r) => (
            <li key={r.key}>{texts.wisOnderdelen?.[r.key] ?? r.label}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-ink">{texts.bewaard}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
          {retained.map((r) => (
            <li key={r.key}>
              {vulIn(texts.bewaardTot, { label: texts.wisOnderdelen?.[r.key] ?? r.label, jaar: YEARS(r.days), basis: klein(texts.wisGronden?.[r.key] ?? r.basis) })}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutralx-500">
          {texts.bewaardVoet}
        </p>
      </div>
    </div>
  );
}
