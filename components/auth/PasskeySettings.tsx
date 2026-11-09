"use client";

import { useCallback, useEffect, useState } from "react";
import { PASSKEY_NL, type PasskeyTexts } from "@/components/auth/passkey-texts";
import { foutNaam, kanPasskeys, naarAanmaakOpties, registratieNaarJson, type AanmaakOptiesJson } from "@/lib/auth/passkey/browser";
import { NAAM_MAX, raadToestelNaam } from "@/lib/auth/passkey/naam";

interface Rij {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
}

interface Status {
  beschikbaar: boolean;
  vraagtWachtwoord: boolean;
  vraagtCode: boolean;
  vraagtMailcode: boolean;
  passkeys: Rij[];
}

type TekstSleutel = keyof PasskeyTexts;

// servercode → tekst (de server zegt het in het Nederlands; zo krijgt een werker zijn eigen taal)
const CODE_TEKST: Record<string, TekstSleutel> = {
  WACHTWOORD_ONJUIST: "wrongPassword",
  CODE_ONJUIST: "wrongCode",
  PASSKEY_VERLOPEN: "expired",
  PASSKEY_MAX: "max",
  PASSKEY_BESTAAT: "exists",
  PASSKEY_GEWEIGERD: "refused",
  TE_VAAK: "tooMany",
  RATE_LIMITED: "tooMany",
  INLOG_GEBLOKKEERD: "tooMany",
  PASSKEY_STORING: "down",
  PASSKEY_NIET_HIER: "notHere",
  PASSKEY_MAILCODE_ONGELDIG: "mailWrong",
  PASSKEY_MAILCODE_VERLOPEN: "mailExpired",
  PASSKEY_MAIL_MISLUKT: "mailFailed",
};

/** De server stuurde de code per mail: geen fout, maar de volgende stap. */
const MAILCODE_GESTUURD = "PASSKEY_MAILCODE_GESTUURD";

async function post(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch("/api/me/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = r ? ((await r.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: Boolean(r?.ok), data };
}

const datum = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

/** Passkeys van het eigen account: lijst, toevoegen (opnieuw bevestigen → toestel) en verwijderen. */
export function PasskeySettings({ texts: t = PASSKEY_NL }: { texts?: PasskeyTexts }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [kan, setKan] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"idle" | "bevestigen" | "toestel">("idle");
  const [naam, setNaam] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [mailcode, setMailcode] = useState("");
  const [mailVerstuurd, setMailVerstuurd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [weg, setWeg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/me/passkeys", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setStatus((await r.json()) as Status);
    else setError(t.genericError);
  }, [t.genericError]);
  useEffect(() => {
    setKan(kanPasskeys());
    void load();
  }, [load]);

  const foutCode = (d: Record<string, unknown>) => (d.error as { code?: unknown } | undefined)?.code;
  const serverFout = (d: Record<string, unknown>) => {
    const c = foutCode(d);
    const sleutel = typeof c === "string" && Object.hasOwn(CODE_TEKST, c) ? CODE_TEKST[c] : undefined;
    return sleutel ? t[sleutel] : t.genericError;
  };

  const stoppen = () => {
    setMode("idle");
    setWachtwoord("");
    setCode("");
    setMailcode("");
    setMailVerstuurd(false);
  };

  // zonder wachtwoord: eerst (of opnieuw) een code per mail
  const stuurCode = async () => {
    setBusy(true);
    setError(null);
    setMelding(null);
    const r = await post({ action: "begin" });
    setBusy(false);
    if (!r.ok && foutCode(r.data) === MAILCODE_GESTUURD) {
      setMailVerstuurd(true);
      setMailcode("");
      setMelding(t.mailSent);
      return;
    }
    setError(serverFout(r.data));
  };

  const toevoegen = async () => {
    if (status?.vraagtMailcode && !mailVerstuurd) {
      await stuurCode();
      return;
    }
    setBusy(true);
    setError(null);
    setMelding(null);
    const begin = await post({
      action: "begin",
      ...(wachtwoord ? { wachtwoord } : {}),
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(mailcode.trim() ? { mailcode: mailcode.trim() } : {}),
    });
    if (!begin.ok) {
      setBusy(false);
      setError(serverFout(begin.data));
      return;
    }
    setMode("toestel");
    let credential: ReturnType<typeof registratieNaarJson>;
    try {
      const cred = (await navigator.credentials.create({ publicKey: naarAanmaakOpties(begin.data.publicKey as AanmaakOptiesJson) })) as PublicKeyCredential | null;
      if (!cred) throw new DOMException("geen passkey", "NotAllowedError");
      credential = registratieNaarJson(cred);
    } catch (err) {
      setBusy(false);
      setMode("bevestigen");
      setCode("");
      // de mailcode is gebruikt: voor een nieuwe poging is een nieuwe nodig
      setMailcode("");
      setMailVerstuurd(false);
      const n = foutNaam(err);
      setError(n === "NotAllowedError" || n === "AbortError" ? t.cancelled : n === "InvalidStateError" ? t.exists : t.genericError);
      return;
    }
    const klaar = await post({ action: "finish", naam, credential });
    setBusy(false);
    if (!klaar.ok) {
      setMode("bevestigen");
      setCode("");
      setMailcode("");
      setMailVerstuurd(false);
      setError(serverFout(klaar.data));
      return;
    }
    // de serverversie van de lijst overnemen
    setStatus((s) => (s ? { ...s, passkeys: klaar.data.passkeys as Rij[] } : s));
    stoppen();
    setMelding(t.added);
  };

  const verwijderen = async (id: string) => {
    setBusy(true);
    setError(null);
    setMelding(null);
    const r = await post({ action: "remove", id });
    setBusy(false);
    setWeg(null);
    if (!r.ok) {
      setError(serverFout(r.data));
      void load();
      return;
    }
    setStatus((s) => (s ? { ...s, passkeys: r.data.passkeys as Rij[] } : s));
  };

  if (!status) {
    return error ? (
      <p role="alert" className="text-sm text-crit">
        {error}
      </p>
    ) : (
      <p className="text-sm text-neutralx-400">{t.loading}</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">{t.intro}</p>

      {status.passkeys.length === 0 ? (
        <p className="text-sm text-neutralx-500">{t.none}</p>
      ) : (
        <ul className="divide-y divide-hair rounded-xl border border-hair">
          {status.passkeys.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {p.name}
                  {p.backedUp && <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-xs font-medium text-neutralx-500">{t.synced}</span>}
                </p>
                <p className="text-xs text-neutralx-500">
                  {t.createdOn.replace("{date}", datum(p.createdAt, t.dateLocale))} · {p.lastUsedAt ? t.lastUsed.replace("{date}", datum(p.lastUsedAt, t.dateLocale)) : t.neverUsed}
                </p>
              </div>
              {weg === p.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutralx-600">{t.removeConfirm}</span>
                  <button type="button" disabled={busy} className="btn-ghost text-sm text-crit disabled:opacity-50" onClick={() => void verwijderen(p.id)}>
                    {busy ? t.busy : t.removeYes}
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={() => setWeg(null)}>
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-ghost text-sm text-crit" onClick={() => setWeg(p.id)}>
                  {t.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!status.beschikbaar ? (
        <p className="text-sm text-neutralx-500">{t.notHere}</p>
      ) : kan === false ? (
        <p className="text-sm text-neutralx-500">{t.unsupported}</p>
      ) : mode === "idle" ? (
        <button
          type="button"
          disabled={kan !== true}
          className="btn-primary text-sm disabled:opacity-50"
          onClick={() => {
            setError(null);
            setMelding(null);
            setNaam(raadToestelNaam(navigator.userAgent));
            setMode("bevestigen");
          }}
        >
          {t.add}
        </button>
      ) : (
        <form
          className="space-y-3 rounded-xl bg-paper-soft p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void toevoegen();
          }}
        >
          <label className="block">
            <span className="field-label">{t.nameLabel}</span>
            <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={NAAM_MAX} required className="field-input" autoComplete="off" />
          </label>
          {(status.vraagtWachtwoord || status.vraagtCode || status.vraagtMailcode) && <p className="text-sm text-neutralx-600">{t.confirmIntro}</p>}
          {status.vraagtMailcode && !mailVerstuurd && <p className="text-sm text-neutralx-600">{t.mailIntro}</p>}
          {status.vraagtMailcode && mailVerstuurd && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="field-label">{t.mailCode}</span>
                <input value={mailcode} onChange={(e) => setMailcode(e.target.value)} required inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field-input w-40 text-center font-mono tracking-widest" />
              </label>
              <button type="button" disabled={busy} className="btn-ghost text-sm disabled:opacity-50" onClick={() => void stuurCode()}>
                {t.resend}
              </button>
            </div>
          )}
          {status.vraagtWachtwoord && (
            <label className="block">
              <span className="field-label">{t.password}</span>
              <input type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} required autoComplete="current-password" className="field-input" />
            </label>
          )}
          {status.vraagtCode && (!status.vraagtMailcode || mailVerstuurd) && (
            <label className="block">
              <span className="field-label">{t.code}</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" autoComplete="one-time-code" maxLength={20} className="field-input w-44 text-center font-mono" />
            </label>
          )}
          {mode === "toestel" && <p className="text-sm font-medium text-ink">{t.deviceStep}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !naam.trim()} className="btn-primary text-sm disabled:opacity-50">
              {busy ? t.busy : status.vraagtMailcode && !mailVerstuurd ? t.sendCode : t.next}
            </button>
            <button type="button" disabled={busy} className="btn-ghost text-sm disabled:opacity-50" onClick={stoppen}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {melding && <p className="text-sm text-ok">{melding}</p>}
      {error && (
        <p role="alert" className="text-sm text-crit">
          {error}
        </p>
      )}
    </div>
  );
}
