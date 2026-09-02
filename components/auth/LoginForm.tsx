"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, googleLoginAction, type LoginState } from "@/app/login/actions";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";

const initial: LoginState = { error: null };

const ERROR_COPY: Record<string, string> = {
  AccessDenied: "Dit Google-account is niet gekoppeld aan een ZekerFlex-account.",
  OAuthAccountNotLinked: "Dit e-mailadres is al met een andere inlogmethode geregistreerd.",
  Configuration: "Google-login is niet geconfigureerd.",
  Verification: "De verificatielink is verlopen of al gebruikt.",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Bezig…" : "Inloggen"}
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
  callbackUrl,
  googleEnabled,
  errorCode,
  justReset,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  errorCode?: string;
  justReset?: boolean;
}) {
  const [state, formAction] = useFormState(loginAction, initial);
  const [showPw, setShowPw] = useState(false);
  const banner = state.error ?? (errorCode ? (ERROR_COPY[errorCode] ?? "Inloggen mislukt.") : null);

  return (
    <div>
      {justReset && !banner && (
        <p className="mb-4 rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
          Je wachtwoord is aangepast. Log in met je nieuwe wachtwoord.
        </p>
      )}
      {banner && <p className="mb-4 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{banner}</p>}

      {googleEnabled && (
        <>
          <form action={googleLoginAction}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton label="Inloggen met Google" />
          </form>
          <AuthDivider />
        </>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <label className="block">
          <span className="field-label">E-mailadres</span>
          <input type="email" name="email" autoComplete="email" required className="field-input" />
        </label>

        <label className="block">
          <span className="field-label">Wachtwoord</span>
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
              aria-label={showPw ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
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
            Ingelogd blijven
          </label>
          <Link href="/wachtwoord-vergeten" className="font-medium text-brand-600 hover:underline">
            Wachtwoord vergeten?
          </Link>
        </div>

        <SubmitButton />
      </form>

      <p className="mt-5 text-center text-xs text-neutralx-500">
        Problemen met inloggen?{" "}
        <a href="mailto:support@zekerflex.com" className="font-medium text-brand-600 hover:underline">
          Neem contact op met support
        </a>
      </p>
    </div>
  );
}
