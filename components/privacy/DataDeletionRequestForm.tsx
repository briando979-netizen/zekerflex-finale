"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestDataDeletionAction, type DataDeletionState } from "@/app/gegevens-verwijderen/actions";

const KINDS: [string, string][] = [
  ["id", "ID-foto's en selfie van de verificatie"],
  ["chat", "Chatberichten"],
  ["location", "Locatiegegevens (GPS-check-ins)"],
  ["profile", "Profielfoto, werkervaring en certificaten"],
  ["marketing", "Gegevens voor nieuwsbrief en marketingmails"],
  ["analytics", "Anonieme gebruiksstatistiek gekoppeld aan mijn account"],
  ["other", "Iets anders (zie toelichting)"],
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Versturen…" : "Verzoek versturen"}
    </button>
  );
}

export function DataDeletionRequestForm() {
  const [state, action] = useFormState<DataDeletionState, FormData>(requestDataDeletionAction, { done: false, error: null });
  if (state.done) {
    return (
      <p className="rounded-lg bg-ok/10 px-4 py-3 text-sm text-neutralx-700">
        Je verzoek is ontvangen. Je krijgt een bevestiging per mail — antwoord daarop om te bevestigen dat het verzoek van jou komt. We
        handelen het binnen één maand af.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}
      <label className="block">
        <span className="field-label">E-mailadres van je ZekerFlex-account</span>
        <input type="email" name="email" required autoComplete="email" className="field-input" />
      </label>
      <fieldset>
        <legend className="field-label">Welke gegevens wil je laten verwijderen?</legend>
        <div className="mt-2 space-y-2">
          {KINDS.map(([k, label]) => (
            <label key={k} className="flex items-start gap-2.5 text-sm text-neutralx-700">
              <input type="checkbox" name="kinds" value={k} className="mt-0.5 h-4 w-4 accent-brand-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="field-label">
          Toelichting <span className="text-neutralx-400">(optioneel)</span>
        </span>
        <textarea name="note" rows={3} maxLength={1500} className="field-input" />
      </label>
      <Submit />
    </form>
  );
}
