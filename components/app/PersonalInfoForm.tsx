"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useToast } from "@/components/ui/Toast";

interface PersonalInfoResult {
  ok: boolean;
  message: string;
}

const initial: PersonalInfoResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
      {pending ? "Opslaan…" : "Opslaan"}
    </button>
  );
}

export function PersonalInfoForm({
  action,
  initialFullName,
  initialPhone,
}: {
  action: (prev: PersonalInfoResult, formData: FormData) => Promise<PersonalInfoResult>;
  initialFullName: string;
  initialPhone: string;
}) {
  const [state, formAction] = useFormState(action, initial);
  const toast = useToast();
  const seen = useRef(state);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.message) {
      if (state.ok) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [state, toast]);

  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);

  return (
    <form action={formAction} className="space-y-4 p-5">
      <label className="block">
        <span className="field-label">Volledige naam</span>
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
          Telefoonnummer <span className="text-neutralx-400">(optioneel)</span>
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
      <Submit />
    </form>
  );
}
