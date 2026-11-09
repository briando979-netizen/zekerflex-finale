"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  confirmAccountDeletionAction,
  type ConfirmDeletionState,
} from "@/app/account-verwijderen/bevestigen/actions";
import { VERTREKREDENEN } from "@/lib/privacy/vertrekredenen";

const initial: ConfirmDeletionState = { error: null };

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full disabled:opacity-50">
      {pending ? "Bezig…" : "Ja, verwijder mijn account"}
    </button>
  );
}

export function ConfirmAccountDeletionForm({ token }: { token: string }) {
  const [state, action] = useFormState(confirmAccountDeletionAction, initial);
  const [confirmText, setConfirmText] = useState("");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}

      <label className="block">
        <span className="field-label">Waarom ga je weg? (niet verplicht)</span>
        <select name="reden" defaultValue="" className="field-input">
          <option value="">Zeg ik liever niet</option>
          {VERTREKREDENEN.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-neutralx-500">Dit helpt ons ZekerFlex beter te maken. We bewaren alleen deze keuze, niet wie je bent.</span>
      </label>

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
