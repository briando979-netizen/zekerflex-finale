"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { employerOnboardingAction, type EmployerOnboardingState } from "@/app/werkgever/onboarding/actions";

const initial: EmployerOnboardingState = { error: null, done: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Bezig met controleren…" : "Organisatie verifiëren"}
    </button>
  );
}

export function EmployerOnboardingForm() {
  const router = useRouter();
  const [state, formAction] = useFormState(employerOnboardingAction, initial);

  if (state.done) {
    return (
      <div className="space-y-4">
        <div className={`card p-5 ${state.kvkValid ? "border-ok/30 bg-ok/5" : "border-warn/30 bg-warn/5"}`}>
          <p className="font-semibold text-ink">
            {state.companyName ?? "Je organisatie"} —{" "}
            {state.kvkValid ? "geverifieerd in het Handelsregister" : "opgeslagen, KVK nog niet bevestigd"}
          </p>
          {state.reasons && state.reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutralx-600">
              {state.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={() => router.push("/werkgever")} className="btn-primary">
          Naar het dashboard
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>
      )}

      <label className="block">
        <span className="field-label">KVK-nummer van de organisatie</span>
        <input name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
        <span className="mt-1 block text-xs text-neutralx-400">Wordt live gecontroleerd in het Handelsregister.</span>
      </label>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Eerste vestiging</legend>
        <label className="block">
          <span className="field-label">Naam vestiging</span>
          <input name="branchName" required placeholder="Bijv. Amsterdam Centrum" className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Adres</span>
          <input name="addressLine" required placeholder="Straat + huisnummer" className="field-input" />
        </label>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <label className="block">
            <span className="field-label">Postcode</span>
            <input name="postalCode" required placeholder="1012 AB" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Huisnr.</span>
            <input name="houseNumber" required placeholder="10" className="field-input" />
          </label>
        </div>
      </fieldset>

      <Submit />
    </form>
  );
}
