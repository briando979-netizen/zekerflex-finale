import { RETENTION_RULES } from "@/lib/privacy/retention";
import { erasureScope } from "@/lib/privacy/anonymize";

const YEARS = (days: number) => Math.round(days / 365);

// Shared explanation of what an AVG art. 17 erasure clears immediately vs.
// what Dutch tax/Wet DBA law forces us to keep a while longer — used on both
// the public deletion-confirmation page and the in-app self-service page, so
// the two never drift from the real retention schedule in lib/privacy/retention.ts.
export function ErasureScopeInfo() {
  const cleared = erasureScope();
  const retained = RETENTION_RULES.filter((r) => r.blocksErasure);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold text-ink">Wordt meteen verwijderd of geanonimiseerd:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
          {cleared.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-ink">Blijft nog even bewaard (wettelijke bewaarplicht):</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutralx-600">
          {retained.map((r) => (
            <li key={r.key}>
              {r.label} — tot {YEARS(r.days)} jaar, {r.basis.toLowerCase()}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutralx-500">
          Deze gegevens worden niet gekoppeld aan een werkend account: je kunt niet meer inloggen en je naam,
          e-mailadres en telefoonnummer zijn al verwijderd.
        </p>
      </div>
    </div>
  );
}
