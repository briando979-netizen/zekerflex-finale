"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { PERSONAL_INFO_NL, type PersonalInfoCode, type PersonalInfoTexts } from "@/components/app/personal-info-texts";

interface PersonalInfoResult {
  ok: boolean;
  message: string;
  /** als de actie hem meegeeft, kiest het formulier de tekst in de taal van de gebruiker (texts.meldingen) */
  code?: PersonalInfoCode;
}

const initial: PersonalInfoResult = { ok: false, message: "" };

function Submit({ t }: { t: PersonalInfoTexts }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
      {pending ? t.bezig : t.opslaan}
    </button>
  );
}

// Naam en telefoon in het account. Werker, werkgever en studio delen dit formulier; de werker geeft zijn eigen taal mee
// (texts, uit lib/i18n/freelancer.ts), de anderen houden de Nederlandse standaard (components/app/personal-info-texts.ts).
export function PersonalInfoForm({
  action,
  initialFullName,
  initialPhone,
  texts = PERSONAL_INFO_NL,
}: {
  action: (prev: PersonalInfoResult, formData: FormData) => Promise<PersonalInfoResult>;
  initialFullName: string;
  initialPhone: string;
  texts?: PersonalInfoTexts;
}) {
  const [state, formAction] = useFormState(action, initial);
  const toast = useToast();
  const seen = useRef(state);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    const tekst = (state.code ? texts.meldingen[state.code] : "") || state.message;
    if (tekst) {
      if (state.ok) toast.success(tekst);
      else toast.error(tekst);
    }
  }, [state, toast, texts]);

  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);

  return (
    <form action={formAction} className="space-y-4 p-5">
      <label className="block">
        <span className="field-label">{texts.naam}</span>
        <input
          name="fullName"
          required
          minLength={2}
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="field-input"
        />
      </label>
      <label className="block">
        <span className="field-label">
          {texts.telefoon} <span className="text-neutralx-400">{texts.optioneel}</span>
        </span>
        <input
          name="phone"
          type="tel"
          maxLength={40}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="06 12345678"
          className="field-input"
        />
      </label>
      <Submit t={texts} />
    </form>
  );
}
