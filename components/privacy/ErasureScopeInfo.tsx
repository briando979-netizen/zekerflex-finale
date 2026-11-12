import { RETENTION_RULES } from "@/lib/privacy/retention";
import { erasureScope } from "@/lib/privacy/anonymize";
import { vulIn } from "@/lib/i18n/vul-in";

/** De vaste teksten; Nederlands is de standaard (openbare pagina), de werker-app geeft zijn eigen taal mee. */
export type ErasureTeksten = { wisNu: string; bewaard: string; bewaardTot: string; bewaardVoet: string };
const NL: ErasureTeksten = {
  wisNu: "Wordt meteen verwijderd of geanonimiseerd:",
  bewaard: "Blijft nog even bewaard (wettelijke bewaarplicht):",
  bewaardTot: "{label} — tot {jaar} jaar, {basis}",
  bewaardVoet: "Deze gegevens worden niet gekoppeld aan een werkend account: je kunt niet meer inloggen en je naam, e-mailadres en telefoonnummer zijn al verwijderd.",
};

const YEARS = (days: number) => Math.round(days / 365);

// Shared explanation of what an AVG art. 17 erasure clears immediately vs.
// what Dutch tax/Wet DBA law forces us to keep a while longer — used on both
// the public deletion-confirmation page and the in-app self-service page, so
// the two never drift from the real retention schedule in lib/privacy/retention.ts.
export function ErasureScopeInfo({ texts = NL }: { texts?: ErasureTeksten }) {
  const cleared = erasureScope();
  const retained = RETENTION_RULES.filter((r) => r.blocksErasure);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold text-ink">{texts.wisNu}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
          {cleared.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-ink">{texts.bewaard}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
          {retained.map((r) => (
            <li key={r.key}>
              {vulIn(texts.bewaardTot, { label: r.label, jaar: YEARS(r.days), basis: r.basis.toLowerCase() })}
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
