"use client";

import { useFormState, useFormStatus } from "react-dom";
import { forgotPasswordAction, type ForgotState } from "@/app/wachtwoord-vergeten/actions";

const initial: ForgotState = { done: false, error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Bezig…" : "Stuur herstellink"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState(forgotPasswordAction, initial);

  if (state.done) {
    return (
      <p className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
        Als dit e-mailadres bij ons bekend is, hebben we een herstellink gestuurd. Check je inbox (en je
        spam). De link is 1 uur geldig.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}
      <label className="block">
        <span className="field-label">E-mailadres</span>
        <input type="email" name="email" autoComplete="email" required className="field-input" />
      </label>
      <Submit />
    </form>
  );
}
