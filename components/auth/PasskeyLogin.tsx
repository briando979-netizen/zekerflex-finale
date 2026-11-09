"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { passkeyLoginAction, type PasskeyLoginState } from "@/app/login/actions";
import { foutNaam, inlogNaarJson, kanPasskeys, kanPasskeySuggestie, meldOnbekendePasskey, naarInlogOpties, type InlogOptiesJson } from "@/lib/auth/passkey/browser";
import { AuthDivider } from "@/components/auth/GoogleButton";
import type { AuthDict } from "@/lib/i18n/auth";

type Teksten = AuthDict["login"]["passkey"];

// foutcode van de server → tekst (lib/auth/passkey/inloggen.ts)
const CODE_TEKST: Record<string, keyof Teksten> = {
  passkey_verlopen: "expired",
  passkey_onbekend: "unknown",
  passkey_uv: "uv",
  passkey_storing: "down",
  passkey_te_vaak: "tooMany",
  locked: "locked",
};

const initial: PasskeyLoginState = { code: null, n: 0 };

/**
 * "Inloggen met passkey" op /login: een knop (alleen als de browser het kan) en,
 * waar de browser dat kent, de passkey als suggestie in het e-mailveld
 * (conditional UI; het veld heeft autocomplete="… webauthn"). Het antwoord van
 * het toestel gaat via een gewoon formulier naar de server-actie, zodat het
 * doorsturen na het inloggen precies zo gaat als bij het wachtwoord.
 */
export function PasskeyLogin({
  texts: t,
  callbackUrl,
  remember,
  className = "",
  divider,
}: {
  texts: Teksten;
  callbackUrl: string;
  remember: boolean;
  className?: string;
  /** "of"-streep eronder (als er geen Google-knop is die er al een heeft) */
  divider?: string;
}) {
  const [state, formAction] = useFormState(passkeyLoginAction, initial);
  const [kan, setKan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const antwoordRef = useRef<HTMLInputElement>(null);
  const lopend = useRef<AbortController | null>(null);
  const laatste = useRef<{ rpId: string; credentialId: string } | null>(null);

  const tekst = useCallback((code: string) => {
    const k = Object.hasOwn(CODE_TEKST, code) ? CODE_TEKST[code] : undefined;
    return k ? t[k] : t.failed;
  }, [t]);

  const inloggen = useCallback(
    async (modus: "knop" | "suggestie") => {
      lopend.current?.abort();
      const ac = new AbortController();
      lopend.current = ac;
      if (modus === "knop") {
        setBusy(true);
        setFout(null);
      }
      const r = await fetch("/api/auth/passkey", { method: "POST" }).catch(() => null);
      const data = r ? ((await r.json().catch(() => ({}))) as { publicKey?: InlogOptiesJson; error?: { code?: string } }) : {};
      if (ac.signal.aborted) return;
      if (!r?.ok || !data.publicKey) {
        if (modus === "knop") {
          setBusy(false);
          setFout(r?.status === 429 ? t.tooMany : t.down);
        }
        return;
      }
      const opties = data.publicKey;
      let cred: PublicKeyCredential | null;
      try {
        cred = (await navigator.credentials.get({
          publicKey: naarInlogOpties(opties),
          signal: ac.signal,
          ...(modus === "suggestie" ? { mediation: "conditional" as CredentialMediationRequirement } : {}),
        })) as PublicKeyCredential | null;
      } catch (err) {
        // afgebroken door een nieuwe poging, of door de gebruiker geannuleerd: geen foutmelding
        if (ac.signal.aborted) return;
        if (modus === "knop") {
          setBusy(false);
          const n = foutNaam(err);
          if (n !== "NotAllowedError" && n !== "AbortError") setFout(t.failed);
        }
        return;
      }
      if (!cred || ac.signal.aborted) {
        setBusy(false);
        return;
      }
      const json = inlogNaarJson(cred);
      laatste.current = { rpId: opties.rpId, credentialId: json.rawId };
      setBusy(true);
      setFout(null);
      if (antwoordRef.current) antwoordRef.current.value = JSON.stringify(json);
      formRef.current?.requestSubmit();
    },
    [t],
  );

  useEffect(() => {
    if (!kanPasskeys()) return;
    setKan(true);
    let weg = false;
    void kanPasskeySuggestie().then((ja) => {
      if (ja && !weg) void inloggen("suggestie");
    });
    return () => {
      weg = true;
      lopend.current?.abort();
    };
  }, [inloggen]);

  // antwoord van de server-actie: alleen bij een mislukte poging komt hier iets (gelukt = doorsturen)
  useEffect(() => {
    if (state.n === 0 || !state.code) return;
    setBusy(false);
    setFout(tekst(state.code));
    if (state.code === "passkey_onbekend" && laatste.current) meldOnbekendePasskey(laatste.current.rpId, laatste.current.credentialId);
  }, [state, tekst]);

  if (!kan) return null;

  return (
    <div className={className}>
      {fout && (
        <p role="alert" className="mb-3 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
          {fout}
        </p>
      )}
      <form ref={formRef} action={formAction}>
        <input ref={antwoordRef} type="hidden" name="response" defaultValue="" />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <input type="hidden" name="remember" value={remember ? "1" : ""} />
        <button type="button" disabled={busy} onClick={() => void inloggen("knop")} className="flex w-full items-center justify-center gap-2.5 rounded-full border border-hairstrong bg-white px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-paper-soft disabled:opacity-60">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
            <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="18" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M18 15.5V21m0-2.5h2m-2 1.5h1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {busy ? t.busy : t.button}
        </button>
      </form>
      {divider && <AuthDivider label={divider} />}
    </div>
  );
}
