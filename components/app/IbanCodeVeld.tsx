"use client";

import { useId } from "react";
import type { IbanCodeTexts } from "@/lib/fiscal/iban-code-teksten";

/**
 * Codeveld bij een gewijzigd IBAN (mailcode of code uit de verificatie-app).
 * Gedeeld door het uitzend-paneel, het onboardingformulier en de wallet-route:
 * de tekst komt als `texts` binnen, de melding is al in de juiste taal.
 */
export function IbanCodeVeld({
  texts,
  melding,
  value,
  onChange,
  onResend,
  busy,
  name,
}: {
  texts: IbanCodeTexts;
  melding: string;
  value: string;
  onChange: (v: string) => void;
  onResend: () => void;
  busy: boolean;
  /** Naam in een formulier (FormData); weglaten buiten een formulier. */
  name?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="field-label">
        {texts.label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          {...(name ? { name } : {})}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={texts.placeholder}
          aria-describedby={`${id}-melding`}
          className="field-input flex-1"
        />
        <button type="button" onClick={onResend} disabled={busy} className="btn-ghost text-sm">
          {texts.resend}
        </button>
      </div>
      <p id={`${id}-melding`} role="alert" className="text-xs text-neutralx-600">
        {melding}
      </p>
    </div>
  );
}
