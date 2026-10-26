"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, googleLoginAction, type LoginState } from "@/app/login/actions";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";
import { AUTH_DICTS, fill } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";

const initial: LoginState = { error: null };

const ERROR_COPY: Record<string, string> = {
  AccessDenied: "Dit Google-account is niet gekoppeld aan een ZekerFlex-account.",
  OAuthAccountNotLinked: "Dit e-mailadres is al met een andere inlogmethode geregistreerd.",
  Configuration: "Google-login is niet geconfigureerd.",
  Verification: "De verificatielink is verlopen of al gebruikt.",
};

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? busy : label}
    </button>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

export function LoginForm({
  locale = "nl",
  callbackUrl,
  googleEnabled,
  errorCode,
  justReset,
}: {
  locale?: Locale;
  callbackUrl: string;
  googleEnabled: boolean;
  errorCode?: string;
  justReset?: boolean;
}) {
  const [state, formAction] = useFormState(loginAction, initial);
  const [showPw, setShowPw] = useState(false);
  const t = AUTH_DICTS[locale].login;
  const or = AUTH_DICTS[locale].shell.or;
  const banner = state.error ?? (errorCode ? (ERROR_COPY[errorCode] ?? t.failed) : null);

  if (state.needsCode && state.challenge) {
    return (
      <div>
        {state.error && <p role="alert" className="mb-4 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <input type="hidden" name="challenge" value={state.challenge} />
          <input type="hidden" name="email" value={state.email ?? ""} />
          <input type="hidden" name="remember" value="1" />
          <div className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">
            <p className="font-semibold text-ink">{t.twoFaTitle}</p>
            <p className="mt-1">{fill(t.twoFaBody, { email: state.email ?? "" })}</p>
          </div>
          <label className="block">
            <span className="field-label">{t.code}</span>
            <input
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={20}
              placeholder="123 456"
              className="field-input text-center font-mono text-xl tracking-[0.3em]"
            />
          </label>
          <SubmitButton label={t.submit} busy={t.busy} />
          {/* full reload on purpose: resets the two-step form state */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">
            {t.back}
          </a>
        </form>
      </div>
    );
  }

  return (
    <div>
      {justReset && !banner && (
        <p className="mb-4 rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
          {t.resetDone}
        </p>
      )}
      {banner && <p role="alert" className="mb-4 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{banner}</p>}

      {googleEnabled && (
        <>
          <form action={googleLoginAction}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton label={t.google} />
          </form>
          <AuthDivider label={or} />
        </>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <label className="block">
          <span className="field-label">{t.email}</span>
          <input type="email" name="email" autoComplete="email" required className="field-input" />
        </label>

        <label className="block">
          <span className="field-label">{t.password}</span>
          <span className="relative mt-1.5 block">
            <input
              type={showPw ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              className="field-input !mt-0 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? t.hidePw : t.showPw}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-neutralx-400 hover:text-ink"
            >
              <EyeIcon off={showPw} />
            </button>
          </span>
        </label>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-neutralx-600">
            <input
              type="checkbox"
              name="remember"
              value="1"
              defaultChecked
              className="h-4 w-4 accent-brand-500"
            />
            {t.remember}
          </label>
          <Link href="/wachtwoord-vergeten" className="font-medium text-brand-600 hover:underline">
            {t.forgot}
          </Link>
        </div>

        <SubmitButton label={t.submit} busy={t.busy} />
      </form>

      <p className="mt-5 text-center text-xs text-neutralx-500">
        {t.trouble}{" "}
        <a href="mailto:support@zekerflex.com" className="font-medium text-brand-600 hover:underline">
          {t.contact}
        </a>
      </p>
    </div>
  );
}
