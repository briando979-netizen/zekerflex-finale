"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteOwnAccountAction, type DeleteOwnAccountState } from "@/app/dashboard/account/verwijderen/actions";
import { wisTikken } from "@/lib/checkin/wachtrij";
import { vulIn } from "@/lib/i18n/vul-in";
import { DELETE_ACCOUNT_NL, type DeleteAccountTexts } from "@/components/app/delete-account-texts";

const initial: DeleteOwnAccountState = { error: null };

function Submit({ disabled, t }: { disabled: boolean; t: DeleteAccountTexts }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full disabled:opacity-50">
      {pending ? t.bezig : t.knop}
    </button>
  );
}

/** `texts`: de teksten van het formulier; zonder Nederlands (de werkgeversapp geeft Engels mee als hij op Engels staat). */
export function DeleteOwnAccountForm({ texts: t = DELETE_ACCOUNT_NL }: { texts?: DeleteAccountTexts }) {
  const [state, action] = useFormState(deleteOwnAccountAction, initial);
  const [confirmText, setConfirmText] = useState("");
  const blok = state.blok;
  const melding = blok
    ? vulIn(blok.reden === "collegas" ? t.blokCollegas : t.blokDiensten, { bedrijf: blok.bedrijf, n: blok.aantal })
    : state.error;

  // het account gaat weg: ook de in- en uitchecks die op dit toestel op bereik wachten
  return (
    <form action={action} onSubmit={() => wisTikken()} className="space-y-4">
      {melding && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{melding}</p>}

      <label className="block">
        <span className="field-label">{t.typ}</span>
        <input
          name="confirmText"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          required
          className="field-input"
        />
      </label>

      <Submit disabled={confirmText.trim().toUpperCase() !== "VERWIJDEREN"} t={t} />
    </form>
  );
}
