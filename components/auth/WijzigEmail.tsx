"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { changeEmailAction, type ChangeEmailState } from "@/app/verifieer-email/actions";
import { AUTH_DICTS, fill } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";

// Op /verifieer-email: de tip om in de spammap te kijken, en een verkeerd
// ingetypt e-mailadres verbeteren zolang het nog niet bevestigd is (4 nov 2026:
// echte accounts die nooit bevestigden). Ingeklapt, zodat het scherm rustig blijft.

const begin: ChangeEmailState = { error: null, ok: null };

function Opslaan({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost w-full text-sm disabled:opacity-60">
      {pending ? busy : label}
    </button>
  );
}

export function WijzigEmail({ locale = "nl" }: { locale?: Locale }) {
  const t = AUTH_DICTS[locale].verify;
  const router = useRouter();
  const [state, formAction] = useFormState(changeEmailAction, begin);

  // het nieuwe adres meteen in de uitleg bovenaan laten zien
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="mt-5 space-y-3 border-t border-hair pt-4">
      <p className="text-sm text-neutralx-600">{t.spamHint}</p>
      {state.ok && (
        <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
          {fill(state.wacht ? t.emailChangedWait : t.emailChanged, { email: state.ok })}
        </p>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-brand-600 hover:underline">{t.wrongEmail}</summary>
        <form action={formAction} className="mt-3 space-y-3">
          {state.error && (
            <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
              {state.error}
            </p>
          )}
          <label className="block">
            <span className="field-label">{t.newEmail}</span>
            <input name="email" type="email" required autoComplete="email" maxLength={160} className="field-input" />
          </label>
          <Opslaan label={t.saveEmail} busy={t.busy} />
        </form>
      </details>
    </div>
  );
}
