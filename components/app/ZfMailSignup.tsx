"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ZF_MAIL_DOMAIN,
  displayNameProblem,
  localPartProblem,
  normalizeLocalPart,
  passwordProblem,
  passwordStrength,
} from "@/lib/mail/zf-address";

// ---------------------------------------------------------------------------
// "Maak je eigen mailadres" — the ZekerFlex Mail signup, laid out like making a
// Google account: the step and its explanation on the left, the fields on the
// right, "Volgende" bottom right. Five steps: name → address (ideas from the
// name or your own, checked as you type) → password → recovery → check. With
// the TransIP key on the server the mailbox exists at once; without it the
// address is reserved and an admin activates it.
// ---------------------------------------------------------------------------

type Dict = Record<
  | "brand" | "heroTitle" | "heroBody" | "heroCta" | "moveOld" | "ownDomainSoon" | "stepName" | "stepNameSub" | "firstName"
  | "lastName" | "stepAddress" | "stepAddressSub" | "ownAddress" | "checking" | "available" | "stepPassword" | "stepPasswordSub"
  | "password" | "confirm" | "showPassword" | "strength" | "levels" | "mismatch" | "stepRecovery" | "stepRecoverySub"
  | "recoveryEmail" | "stepReview" | "stepReviewSub" | "sender" | "terms" | "create" | "creating" | "next" | "back"
  | "doneTitle" | "doneBody" | "queuedTitle" | "queuedBody" | "blockedBody" | "failed",
  string
>;

interface Account {
  address: string;
  displayName: string;
  status: "aangevraagd" | "actief" | "geblokkeerd";
}
interface Status {
  live: boolean;
  account: Account | null;
  mayCreate: boolean;
  reason: string | null;
  suggestions: string[];
  fullName: string;
  email: string;
}

type Step = "naam" | "adres" | "wachtwoord" | "herstel" | "controle";
const STEPS: Step[] = ["naam", "adres", "wachtwoord", "herstel", "controle"];
const OWN = "__eigen__";

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

function Field({ label, value, onChange, type = "text", autoComplete, suffix, autoFocus }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="relative flex h-14 items-center rounded-md border border-neutralx-300 bg-white focus-within:border-brand-600 focus-within:ring-1 focus-within:ring-brand-600">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="peer h-full min-w-0 flex-1 rounded-md bg-transparent px-4 pt-3 text-[15px] text-ink outline-none"
      />
      {suffix && <span className="flex-shrink-0 pr-4 pt-3 text-[15px] text-neutralx-500">{suffix}</span>}
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-[15px] text-neutralx-500 transition-all peer-focus:top-2 peer-focus:text-xs peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs">
        {label}
      </span>
    </label>
  );
}

function MailMark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function ZfMailSignup({ t, onCreated, onMoveOld }: { t: Dict; onCreated: () => void; onMoveOld: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("naam");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [choice, setChoice] = useState("");
  const [own, setOwn] = useState("");
  const [ownCheck, setOwnCheck] = useState<{ busy: boolean; ok: boolean; text: string | null }>({ busy: false, ok: false, text: null });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Account | null>(null);

  const load = useCallback(async (name?: string) => {
    const res = await fetch(`/api/me/zfmail${name ? `?name=${encodeURIComponent(name)}` : ""}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return null;
    const d = (await res.json()) as Status;
    setStatus(d);
    setIdeas(d.suggestions);
    return d;
  }, []);

  useEffect(() => {
    void load().then((d) => {
      if (!d) return;
      const parts = d.fullName.trim().split(/\s+/);
      setFirst(parts[0] ?? "");
      setLast(parts.slice(1).join(" "));
      setRecovery(d.email);
    });
  }, [load]);

  // own address: instant rule check, then the server says whether it is free
  useEffect(() => {
    if (choice !== OWN) return;
    const lp = normalizeLocalPart(own);
    const problem = lp ? localPartProblem(lp) : null;
    if (!lp || problem) {
      setOwnCheck({ busy: false, ok: false, text: problem });
      return;
    }
    setOwnCheck({ busy: true, ok: false, text: null });
    const timer = setTimeout(() => {
      fetch(`/api/me/zfmail/check?name=${encodeURIComponent(lp)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { available?: boolean; reason?: string | null; address?: string }) =>
          setOwnCheck({ busy: false, ok: Boolean(d.available), text: d.available ? fill(t.available, { address: d.address ?? "" }) : (d.reason ?? null) }),
        )
        .catch(() => setOwnCheck({ busy: false, ok: false, text: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [own, choice, t.available]);

  if (!status) return null;
  const displayName = `${first.trim()} ${last.trim()}`.trim();
  const localPart = choice === OWN ? normalizeLocalPart(own) : (choice.split("@")[0] ?? "");
  const address = `${localPart}@${ZF_MAIL_DOMAIN}`;
  const strength = passwordStrength(pw);
  const levels = t.levels.split("|");

  // an address already exists: say where it stands
  const account = made ?? status.account;
  if (account) {
    if (account.status === "actief" && !made) return null;
    const isDone = account.status === "actief";
    return (
      <section className="card flex items-start gap-4 p-5" aria-live="polite">
        <MailMark />
        <div className="min-w-0 flex-1">
          {account.status === "geblokkeerd" ? (
            <p className="text-sm text-crit">{fill(t.blockedBody, { address: account.address })}</p>
          ) : (
            <>
              <h2 className="font-display text-lg font-bold text-ink">
                {isDone ? fill(t.doneTitle, { name: first || account.displayName }) : fill(t.queuedTitle, { address: account.address })}
              </h2>
              <p className="mt-1 text-sm text-neutralx-600">{isDone ? fill(t.doneBody, { address: account.address }) : t.queuedBody}</p>
            </>
          )}
        </div>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/10" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <MailMark />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-ink">{t.heroTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
              {fill(t.heroBody, { example: ideas[0] ?? `jouw.naam@${ZF_MAIL_DOMAIN}` })}
            </p>
            {!status.mayCreate && status.reason && <p className="mt-2 text-sm font-medium text-warn">{status.reason}</p>}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button type="button" disabled={!status.mayCreate} onClick={() => setOpen(true)} className="btn-primary rounded-full px-6 disabled:opacity-50">
              {t.heroCta}
            </button>
            <button type="button" onClick={onMoveOld} className="text-xs font-medium text-brand-600 hover:underline">
              {t.moveOld}
            </button>
            <span className="text-[11px] text-neutralx-400">{t.ownDomainSoon}</span>
          </div>
        </div>
      </section>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const problem: string | null = (() => {
    if (step === "naam") return first.trim() ? displayNameProblem(displayName) : null;
    if (step === "wachtwoord") return pw ? passwordProblem(pw, { localPart, name: displayName }) ?? (pw2 && pw2 !== pw ? t.mismatch : null) : null;
    if (step === "herstel") return recovery && !emailOk(recovery) ? "Vul een geldig e-mailadres in." : null;
    return null;
  })();
  const canNext =
    step === "naam" ? Boolean(first.trim()) && !displayNameProblem(displayName)
    : step === "adres" ? (choice === OWN ? ownCheck.ok : Boolean(choice))
    : step === "wachtwoord" ? !passwordProblem(pw, { localPart, name: displayName }) && pw === pw2
    : step === "herstel" ? !recovery || emailOk(recovery)
    : terms;

  const next = async () => {
    setError(null);
    if (step === "naam") {
      const d = await load(displayName);
      if (d && !d.suggestions.includes(choice)) setChoice(d.suggestions[0] ?? OWN);
    }
    if (step !== "controle") {
      setStep(STEPS[stepIndex + 1]!);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/me/zfmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localPart, displayName, password: pw, ...(recovery ? { recoveryEmail: recovery } : {}), acceptTerms: true }),
    }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(d?.error?.message ?? t.failed);
      return;
    }
    setPw("");
    setPw2("");
    setMade(d.account as Account);
    onCreated();
  };

  const title = { naam: t.stepName, adres: t.stepAddress, wachtwoord: t.stepPassword, herstel: t.stepRecovery, controle: t.stepReview }[step];
  const sub = { naam: t.stepNameSub, adres: t.stepAddressSub, wachtwoord: t.stepPasswordSub, herstel: t.stepRecoverySub, controle: t.stepReviewSub }[step];

  let fields: ReactNode;
  if (step === "naam") {
    fields = (
      <div className="space-y-4">
        <Field label={t.firstName} value={first} onChange={setFirst} autoComplete="given-name" autoFocus />
        <Field label={t.lastName} value={last} onChange={setLast} autoComplete="family-name" />
      </div>
    );
  } else if (step === "adres") {
    fields = (
      <fieldset className="space-y-1">
        <legend className="sr-only">{t.stepAddress}</legend>
        {[...ideas, OWN].map((opt) => (
          <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-paper-soft">
            <input type="radio" name="zf-address" checked={choice === opt} onChange={() => setChoice(opt)} className="h-4 w-4 accent-brand-600" />
            <span className="text-[15px] text-ink">{opt === OWN ? t.ownAddress : opt}</span>
          </label>
        ))}
        {choice === OWN && (
          <div className="pt-2">
            <Field label={t.ownAddress} value={own} onChange={setOwn} suffix={`@${ZF_MAIL_DOMAIN}`} autoComplete="off" autoFocus />
            <p aria-live="polite" className={`mt-2 min-h-5 text-sm ${ownCheck.ok ? "text-ok" : "text-neutralx-500"}`}>
              {ownCheck.busy ? t.checking : ownCheck.text}
            </p>
          </div>
        )}
      </fieldset>
    );
  } else if (step === "wachtwoord") {
    fields = (
      <div className="space-y-4">
        <Field label={t.password} value={pw} onChange={setPw} type={show ? "text" : "password"} autoComplete="new-password" autoFocus />
        <Field label={t.confirm} value={pw2} onChange={setPw2} type={show ? "text" : "password"} autoComplete="new-password" />
        <label className="flex items-center gap-2 text-sm text-neutralx-600">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {t.showPassword}
        </label>
        {pw && (
          <div>
            <div className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${strength >= i ? (strength >= 3 ? "bg-ok" : strength === 2 ? "bg-warn" : "bg-crit") : "bg-hair"}`} />
              ))}
            </div>
            <p className="mt-1 text-xs text-neutralx-500">{fill(t.strength, { level: levels[strength] ?? "" })}</p>
          </div>
        )}
      </div>
    );
  } else if (step === "herstel") {
    fields = <Field label={t.recoveryEmail} value={recovery} onChange={setRecovery} type="email" autoComplete="email" autoFocus />;
  } else {
    fields = (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-hair p-4">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white" aria-hidden>
            {(first.trim()[0] ?? "?").toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{displayName}</span>
            <span className="block truncate text-sm text-neutralx-600">{address}</span>
          </span>
        </div>
        {recovery && <p className="text-sm text-neutralx-600">{t.recoveryEmail}: {recovery}</p>}
        <label className="flex items-start gap-3 text-sm text-neutralx-700">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-600" />
          {t.terms}
        </label>
      </div>
    );
  }

  return (
    <section className="rounded-[28px] border border-hair bg-white p-6 shadow-card sm:p-10" aria-labelledby="zf-signup-title">
      <div className="grid gap-8 md:grid-cols-[1fr_1.15fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <MailMark />
            <span className="font-display text-base font-bold text-ink">{t.brand}</span>
          </div>
          <h2 id="zf-signup-title" className="mt-6 font-display text-3xl font-bold leading-tight text-ink">
            {title}
          </h2>
          <p className="mt-2 text-[15px] text-neutralx-600">{sub}</p>
          <ol className="mt-6 flex gap-1.5" aria-label={`${stepIndex + 1} / ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={`h-1.5 w-8 rounded-full ${i <= stepIndex ? "bg-brand-600" : "bg-hair"}`} />
            ))}
          </ol>
        </div>
        <div className="flex min-h-[260px] flex-col">
          <div className="flex-1">{fields}</div>
          {(problem || error) && (
            <p role="alert" className="mt-3 text-sm text-crit">
              {error ?? problem}
            </p>
          )}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => (stepIndex === 0 ? setOpen(false) : setStep(STEPS[stepIndex - 1]!))}
              className="rounded-full px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              {t.back}
            </button>
            <button type="button" disabled={!canNext || busy} onClick={() => void next()} className="btn-primary rounded-full px-6 disabled:opacity-50">
              {step === "controle" ? (busy ? t.creating : t.create) : t.next}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
