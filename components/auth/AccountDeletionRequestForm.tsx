"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestAccountDeletionAction, type RequestDeletionState } from "@/app/account-verwijderen/actions";

const initial: RequestDeletionState = { done: false, error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Bezig…" : "Stuur bevestigingslink"}
    </button>
  );
}

export function AccountDeletionRequestForm() {
  const [state, action] = useFormState(requestAccountDeletionAction, initial);

  if (state.done) {
    return (
      <p className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
        Als dit e-mailadres bij ons bekend is, hebben we een bevestigingslink gestuurd. Check je inbox (en je
        spam). De link is 1 uur geldig en leidt naar een pagina waar je precies ziet wat er verwijderd wordt
        voordat je het bevestigt.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}
      <label className="block">
        <span className="field-label">E-mailadres van je ZekerFlex-account</span>
        <input type="email" name="email" autoComplete="email" required className="field-input" />
      </label>
      <Submit />
    </form>
  );
}
