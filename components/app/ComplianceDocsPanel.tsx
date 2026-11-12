"use client";

import { IbanCodeVeld } from "@/components/app/IbanCodeVeld";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { AUTH_DICTS, fill, type AuthDict } from "@/lib/i18n/auth";
import { ibanCodeBericht, isIbanCodeFout } from "@/lib/fiscal/iban-code-teksten";
import { ibanKlopt } from "@/lib/onboarding/velden";
import { useEffect, useRef, useState } from "react";

interface Doc {
  id: string;
  kind: "id" | "bank" | "other";
  filename: string;
  uploadedAt: string;
  status: "uploaded" | "approved" | "rejected";
}
interface Data {
  docs: Doc[];
  status: { idOk: boolean; bankOk: boolean; complete: boolean };
  /** Laatste vier cijfers van het IBAN dat nu bij ons staat; het hele nummer komt nooit terug. */
  ibanLast4?: string | null;
}

/**
 * Eerste stap van "Bankrekening bevestigen": het rekeningnummer. Het wordt maar op
 * deze ene plek gevraagd (niet meer in het onboardingformulier of bij Uitzenden).
 * Het slaat op via /api/me/uitzend, net als het uitzendpaneel eerder deed, met
 * dezelfde bevestigingscode (mail of verificatie-app) bij een gewijzigd nummer.
 */
function IbanStap({ t, ibanLast4, onSaved }: { t: AuthDict["page"]; ibanLast4: string | null; onSaved: () => void }) {
  const ft = useFT();
  const [bewerken, setBewerken] = useState(false);
  const [iban, setIban] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  // Een gewijzigd IBAN vraagt een code (mail of verificatie-app): het veld verschijnt na de eerste 423.
  const [code, setCode] = useState("");
  const [codeMelding, setCodeMelding] = useState<string | null>(null);

  const toonVeld = bewerken || !ibanLast4;

  async function opslaan(metCode = true) {
    if (!ibanKlopt(iban)) {
      setFout(t.ibanInvalid);
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/me/uitzend", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban, ...(metCode && code.trim() ? { ibanCode: code.trim() } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCodeMelding(null);
        setCode("");
        setIban("");
        setBewerken(false);
        onSaved();
      } else if (isIbanCodeFout(r.status, d?.error?.code)) {
        setCode("");
        setCodeMelding(ibanCodeBericht(d.error.code, ft.ibanCode, d.error.message));
      } else {
        setFout(typeof d?.error?.message === "string" ? d.error.message : t.ibanFailed);
      }
    } catch {
      setFout(t.ibanFailed);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${ibanLast4 && !bewerken ? "border-ok/40 bg-ok/5" : "border-hairstrong"}`}>
      {toonVeld ? (
        <>
          <label htmlFor="rekeningnummer-stap" className="text-sm font-semibold text-ink">
            {t.ibanLabel} <span className="text-crit">*</span>
          </label>
          <p id="rekeningnummer-uitleg" className="mt-1 text-xs text-neutralx-500">
            {t.ibanWhy}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id="rekeningnummer-stap"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void opslaan();
                }
              }}
              placeholder="NL00 BANK 0000 0000 00"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby="rekeningnummer-uitleg"
              aria-invalid={fout ? true : undefined}
              className="field-input min-w-0 flex-1 font-mono"
            />
            <button type="button" onClick={() => void opslaan()} disabled={bezig || iban.trim().length < 15} className="btn-primary text-sm disabled:opacity-50">
              {bezig ? t.ibanSaving : t.ibanSave}
            </button>
            {bewerken && (
              <button
                type="button"
                onClick={() => {
                  setBewerken(false);
                  setFout(null);
                  setCodeMelding(null);
                  setIban("");
                }}
                className="btn-ghost text-sm"
              >
                {t.ibanCancel}
              </button>
            )}
          </div>
          {codeMelding && (
            <div className="mt-3">
              <IbanCodeVeld
                texts={ft.ibanCode}
                melding={codeMelding}
                value={code}
                onChange={setCode}
                onResend={() => {
                  setCode("");
                  void opslaan(false);
                }}
                busy={bezig}
              />
            </div>
          )}
          {fout && (
            <p role="alert" className="mt-2 text-xs text-crit">
              {fout}
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">{t.ibanLabel}</span>
            <span className="mt-0.5 block text-xs text-neutralx-600">{fill(t.ibanEndsOn, { last4: ibanLast4 ?? "" })}</span>
          </p>
          <button type="button" onClick={() => setBewerken(true)} className="btn-ghost flex-shrink-0 text-sm">
            {t.ibanChange}
          </button>
        </div>
      )}
    </div>
  );
}


function DocSlot({
  kind,
  label,
  hint,
  doc,
  onUploaded,
  t,
}: {
  t: AuthDict["page"];
  kind: "id" | "bank";
  label: string;
  hint: string;
  doc: Doc | undefined;
  onUploaded: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const r = await fetch("/api/me/documents", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? t.uploadFailed);
      }
      onUploaded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ok = doc && doc.status !== "rejected";

  return (
    <div className={`rounded-xl border p-4 ${ok ? "border-ok/40 bg-ok/5" : "border-hairstrong"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {label} <span className="text-crit">*</span>
        </p>
        {ok ? (
          <span className="text-xs font-medium text-ok">
            {doc!.status === "approved" ? t.approved : t.uploaded}
          </span>
        ) : doc?.status === "rejected" ? (
          <span className="text-xs font-medium text-crit">{t.rejectedUpload}</span>
        ) : (
          <span className="text-xs text-neutralx-400">{t.notUploaded}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutralx-500">{hint}</p>
      {doc && (
        <a
          href={`/api/me/documents/${doc.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block truncate text-xs text-brand-600 hover:underline"
        >
          {doc.filename}
        </a>
      )}
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="btn-ghost mt-3 text-sm">
        {busy ? t.uploading : doc ? t.replace : t.upload}
      </button>
      {err && <p role="alert" className="mt-1 text-xs text-crit">{err}</p>}
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </div>
  );
}

interface BankLogin {
  status: "verified" | "mismatch";
  verifiedName: string;
  ibanLast4: string;
  problems: ("name" | "iban")[];
}

/**
 * Bank account check by logging in at your own bank (iDEAL via Stripe,
 * lib/kyc/bank-login.ts) — replaces the bank-statement upload. The upload
 * stays behind a link for people without a Dutch bank.
 */
function BankLoginSlot({
  t,
  bankDoc,
  bankOk,
  heeftIban,
  onChanged,
}: {
  t: AuthDict["page"];
  bankDoc: Doc | undefined;
  bankOk: boolean;
  /** Er staat een rekeningnummer: pas dan kunnen we het met de bank vergelijken. */
  heeftIban: boolean;
  onChanged: () => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // het live Stripe-account ontvangt even geen betalingen: dan meteen het bankafschrift, met een rustige uitleg
  const [tijdelijkUit, setTijdelijkUit] = useState(false);
  const [result, setResult] = useState<BankLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(Boolean(bankDoc));

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("bank_session");
    const load = () =>
      fetch("/api/me/bank-verify", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setEnabled(Boolean(d.enabled));
          setTijdelijkUit(d.tijdelijkUit === true);
          setResult(d.result ?? null);
        })
        .catch(() => setEnabled(false));
    if (sessionId) {
      url.searchParams.delete("bank_session");
      window.history.replaceState(null, "", url.toString());
      if (sessionId === "geannuleerd") {
        setNote(t.bankLoginCancelled);
        void load();
      } else {
        setChecking(true);
        fetch("/api/me/bank-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync", sessionId }),
        })
          .then(() => load())
          .then(() => onChanged())
          .finally(() => setChecking(false));
        return;
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/me/bank-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      setNote(d?.error?.message ?? t.uploadFailed);
    } catch {
      setNote(t.uploadFailed);
    }
    setBusy(false);
  }

  const fill = (s: string) => s.replace("{name}", result?.verifiedName ?? "").replace("{last4}", result?.ibanLast4 ?? "");
  const verified = result?.status === "verified" && bankOk;

  if (enabled === false) {
    return <DocSlot t={t} kind="bank" label={t.bankLabel} hint={t.bankHint} doc={bankDoc} onUploaded={onChanged} />;
  }
  if (tijdelijkUit && !bankOk) {
    return (
      <div className="space-y-2">
        <p role="status" className="rounded-lg bg-paper-soft px-3 py-2 text-xs leading-relaxed text-ink-soft">
          {t.bankLoginTijdelijkUit}
        </p>
        <DocSlot t={t} kind="bank" label={t.bankLabel} hint={t.bankHint} doc={bankDoc} onUploaded={onChanged} />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${bankOk ? "border-ok/40 bg-ok/5" : "border-hairstrong"}`}>
      <p className="text-sm font-semibold text-ink">
        {t.bankLoginTitle} <span className="text-crit">*</span>
      </p>
      <p className="mt-1 text-xs text-neutralx-500">{t.bankLoginHint}</p>

      {checking ? (
        <p className="mt-3 text-sm text-neutralx-600">{t.bankLoginChecking}</p>
      ) : verified ? (
        <p className="mt-3 text-sm font-medium text-ok">{fill(t.bankLoginOk)}</p>
      ) : (
        <>
          {result?.status === "mismatch" && (
            <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-neutralx-700">
              {result.problems.includes("iban") ? fill(t.bankLoginNoIban) : fill(t.bankLoginNoName)}
            </p>
          )}
          {!bankOk && (
            <button type="button" onClick={() => void start()} disabled={busy || enabled === null || !heeftIban} className="btn-primary mt-3 w-full text-sm disabled:opacity-50">
              {busy ? t.bankLoginBusy : t.bankLoginButton}
            </button>
          )}
          {!bankOk && !heeftIban && <p className="mt-2 text-xs text-neutralx-500">{t.ibanFirst}</p>}
        </>
      )}
      {note && <p className="mt-2 text-xs text-neutralx-600">{note}</p>}

      {!verified && (
        <div className="mt-3 border-t border-hair pt-3">
          {showUpload ? (
            <DocSlot t={t} kind="bank" label={t.bankLabel} hint={t.bankHint} doc={bankDoc} onUploaded={onChanged} />
          ) : (
            <button type="button" onClick={() => setShowUpload(true)} className="text-xs font-medium text-neutralx-500 underline hover:text-ink">
              {t.bankLoginFallback}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ComplianceDocsPanel({ idInForm = false }: { idInForm?: boolean } = {}) {
  const t = AUTH_DICTS[useI18n().locale].page;
  const [d, setD] = useState<Data | null>(null);
  const load = () =>
    fetch("/api/me/documents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => {
        // een foutantwoord ({ error }) mag niet als gegevens in de state (crash op d.docs)
        if (d && Array.isArray(d.docs)) setD(d);
      })
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  if (!d) return null;
  const idDoc = d.docs.find((x) => x.kind === "id");
  const bankDoc = d.docs.find((x) => x.kind === "bank");
  // The ID slot is a fallback only: a normal onboarding submission already
  // fills this automatically (lib/onboarding/verify.ts), so showing it as a
  // second "mandatory" upload here reads as a duplicate ask. Only surface it
  // again if it's actually still missing or got rejected — e.g. an older
  // account from before that auto-fill existed.
  const showId = !d.status.idOk && !idInForm;

  return (
    <div className="space-y-4">
      {/* Under the verification form the bank block explains itself — no second warning box. */}
      {idInForm && !showId ? null : d.status.complete ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-neutralx-700">
          {t.allDone}
        </p>
      ) : (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-neutralx-700">
          {showId ? t.needBoth : idInForm && !d.status.idOk ? t.needBankHere : t.needBank}
        </p>
      )}
      <div className="space-y-3">
        {showId && (
          <DocSlot
            t={t}
            kind="id"
            label={t.idLabel}
            hint={t.idHint}
            doc={idDoc}
            onUploaded={load}
          />
        )}
        <IbanStap t={t} ibanLast4={d.ibanLast4 ?? null} onSaved={load} />
        <BankLoginSlot t={t} bankDoc={bankDoc} bankOk={d.status.bankOk} heeftIban={Boolean(d.ibanLast4)} onChanged={load} />
      </div>
      <p className="text-xs text-neutralx-400">
        {t.other}
      </p>
    </div>
  );
}
