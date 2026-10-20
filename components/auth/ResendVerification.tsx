"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  resendVerificationAction,
  confirmCodeAction,
  type CodeState,
} from "@/app/verifieer-email/actions";

import { AUTH_DICTS } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";

const initialCode: CodeState = { error: null };

function SubmitCode({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? busy : label}
    </button>
  );
}

export function ResendVerification({
  locale = "nl",
  devLink,
  devCode,
}: {
  locale?: Locale;
  devLink: string | null;
  devCode?: string | null;
}) {
  const t = AUTH_DICTS[locale].verify;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(devLink);
  const [code, setCode] = useState<string | null>(devCode ?? null);
  const [state, formAction] = useFormState(confirmCodeAction, initialCode);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2">
        <label htmlFor="code" className="block text-sm font-medium text-ink">
          {t.codeLabel}
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123456"
          className="w-full rounded-lg border border-hairstrong px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-brand-500"
        />
        {state.error && <p className="text-sm text-crit">{state.error}</p>}
        <SubmitCode label={t.confirm} busy={t.confirming} />
      </form>

      <div className="border-t border-hair pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resendVerificationAction();
              setMsg(r.message);
              if (r.link) setLink(r.link);
              if (r.code) setCode(r.code);
            })
          }
          className="btn-ghost"
        >
          {pending ? t.busy : t.resend}
        </button>
        {msg && <p className="mt-2 text-sm text-neutralx-600">{msg}</p>}
      </div>

      {(code || link) && (
        <div className="rounded-lg border border-hair bg-paper-soft p-3 text-xs text-neutralx-600">
          {t.local}
          {code && (
            <p className="mt-2 font-mono text-lg tracking-[0.3em] text-brand-600">{code}</p>
          )}
          {link && (
            <p className="mt-1">
              <a href={link} className="break-all text-brand-600 underline">
                {link}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
