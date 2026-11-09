"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  resendVerificationAction,
  confirmCodeAction,
  type CodeState,
} from "@/app/verifieer-email/actions";

import { AUTH_DICTS, fill } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";
import { mailProviderFor } from "@/lib/auth/mail-providers";

const initialCode: CodeState = { error: null };

/** Hoe vaak we vragen of het adres elders (ander tabblad of apparaat) is bevestigd. */
const POLL_MS = 4000;

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
  email = "",
  devLink,
  devCode,
}: {
  locale?: Locale;
  email?: string;
  devLink: string | null;
  devCode?: string | null;
}) {
  const t = AUTH_DICTS[locale].verify;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(devLink);
  const [code, setCode] = useState<string | null>(devCode ?? null);
  const [typed, setTyped] = useState("");
  const [wait, setWait] = useState(0);
  const [state, formAction] = useFormState(confirmCodeAction, initialCode);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = mailProviderFor(email);

  // Alleen cijfers; een geplakte "123 456" of "123-456" wordt gewoon 123456.
  // Bij 6 cijfers meteen controleren, zonder op de knop te hoeven drukken.
  const onType = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setTyped(digits);
    if (digits.length === 6) {
      // wacht tot React de waarde in het veld heeft gezet
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  };

  // Na een foute code het veld leegmaken en weer focus geven, zodat je direct opnieuw kunt typen.
  useEffect(() => {
    if (state.error) {
      setTyped("");
      inputRef.current?.focus();
    }
  }, [state]);

  // Aftelling van de wachttijd voor "opnieuw versturen".
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  // Is het adres intussen bevestigd (link op de telefoon, ander tabblad)? Dan zelf doorgaan.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = (await res.json()) as { authenticated?: boolean; emailVerified?: boolean };
        if (!stopped && me.authenticated && me.emailVerified) router.replace("/start");
      } catch {
        /* geen verbinding: volgende ronde opnieuw */
      }
    };
    const id = setInterval(() => void check(), POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return (
    <div className="space-y-4">
      {provider && (
        <a
          href={provider.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost block w-full text-center text-sm"
        >
          {fill(t.openMail, { naam: provider.naam })}
        </a>
      )}

      <form ref={formRef} action={formAction} className="space-y-2">
        <label htmlFor="code" className="block text-sm font-medium text-ink">
          {t.codeLabel}
        </label>
        <input
          ref={inputRef}
          id="code"
          name="code"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoFocus
          maxLength={14}
          value={typed}
          onChange={(e) => onType(e.target.value)}
          placeholder="123456"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "code-fout" : undefined}
          className="w-full rounded-lg border border-hairstrong px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-brand-500"
        />
        {state.error && (
          <p id="code-fout" role="alert" className="text-sm text-crit">
            {state.error}
          </p>
        )}
        <SubmitCode label={t.confirm} busy={t.confirming} />
      </form>

      <div className="border-t border-hair pt-3">
        <button
          type="button"
          disabled={pending || wait > 0}
          onClick={() =>
            start(async () => {
              const r = await resendVerificationAction();
              setMsg(r.message);
              if (r.link) setLink(r.link);
              if (r.code) setCode(r.code);
              if (r.cooldown) setWait(r.cooldown);
            })
          }
          className="btn-ghost disabled:opacity-60"
        >
          {pending ? t.busy : t.resend}
        </button>
        {wait > 0 && (
          <p className="mt-2 text-sm text-neutralx-600" aria-live="off">
            {fill(t.resendIn, { s: String(wait) })}
          </p>
        )}
        {msg && (
          <p role="status" className="mt-2 text-sm text-neutralx-600">
            {msg}
          </p>
        )}
      </div>

      <p className="text-xs text-neutralx-600">{t.autoHint}</p>

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
