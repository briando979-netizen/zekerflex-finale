"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteOwnAccountAction, type DeleteOwnAccountState } from "@/app/dashboard/account/verwijderen/actions";

const initial: DeleteOwnAccountState = { error: null };

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full disabled:opacity-50">
      {pending ? "Bezig…" : "Ja, verwijder mijn account"}
    </button>
  );
}

export function DeleteOwnAccountForm() {
  const [state, action] = useFormState(deleteOwnAccountAction, initial);
  const [confirmText, setConfirmText] = useState("");

  return (
    <form action={action} className="space-y-4">
      {state.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}

      <label className="block">
        <span className="field-label">
          Typ <strong>VERWIJDEREN</strong> om te bevestigen
        </span>
        <input
          name="confirmText"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          required
          className="field-input"
        />
      </label>

      <Submit disabled={confirmText.trim().toUpperCase() !== "VERWIJDEREN"} />
    </form>
  );
}
