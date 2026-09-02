"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { resetPasswordAction, type ResetState } from "@/app/wachtwoord-herstellen/actions";

const initial: ResetState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Bezig…" : "Wachtwoord opslaan"}
    </button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState(resetPasswordAction, initial);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}

      <label className="block">
        <span className="field-label">Nieuw wachtwoord</span>
        <input
          type={show ? "text" : "password"}
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="field-input"
        />
      </label>
      <label className="block">
        <span className="field-label">Herhaal wachtwoord</span>
        <input
          type={show ? "text" : "password"}
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          className="field-input"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-neutralx-600">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-brand-500" />
        Wachtwoorden tonen
      </label>

      <Submit />
    </form>
  );
}
