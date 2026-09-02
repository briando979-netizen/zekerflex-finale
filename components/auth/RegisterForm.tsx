"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, type RegisterState } from "@/app/register/actions";
import { googleLoginAction } from "@/app/login/actions";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";

const initial: RegisterState = { error: null };

const WORKER_KINDS = [
  { k: "zzp", l: "ZZP'er", d: "Eigen KVK + btw" },
  { k: "flexwerker", l: "Flexwerker", d: "Btw optioneel / KOR" },
  { k: "uitzendkracht", l: "Uitzendkracht", d: "Verloning via payroll" },
] as const;

const STRENGTH_COLOR = ["bg-crit", "bg-crit", "bg-warn", "bg-brand-500", "bg-ok"];

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

function SubmitButton({ type, disabled }: { type: "freelancer" | "bedrijf"; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full disabled:opacity-50">
      {pending ? "Bezig…" : type === "bedrijf" ? "Organisatie aanmelden" : "Account aanmaken"}
    </button>
  );
}

export function RegisterForm({
  defaultType,
  googleEnabled,
}: {
  defaultType: "freelancer" | "bedrijf";
  googleEnabled: boolean;
}) {
  const [type, setType] = useState<"freelancer" | "bedrijf">(defaultType);
  const [workerKind, setWorkerKind] = useState<"zzp" | "flexwerker" | "uitzendkracht">("flexwerker");
  const [state, formAction] = useFormState(registerAction, initial);

  // ---- company (KVK) --------------------------------------------------
  const [company, setCompany] = useState("");
  const [kvk, setKvk] = useState("");
  const [kvkResults, setKvkResults] = useState<{ kvkNumber: string; name: string; city?: string }[]>([]);
  const [kvkConfigured, setKvkConfigured] = useState(true);
  const [kvkOpen, setKvkOpen] = useState(false);

  useEffect(() => {
    if (type !== "bedrijf" || kvk || company.trim().length < 2) {
      setKvkResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company/search?q=${encodeURIComponent(company.trim())}`);
        const d = await res.json();
        setKvkConfigured(d.configured !== false);
        setKvkResults(Array.isArray(d.results) ? d.results : []);
        setKvkOpen(true);
      } catch {
        /* ignore */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [company, type, kvk]);

  // ---- email availability -------------------------------------------
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailState(email ? "invalid" : "idle");
      return;
    }
    setEmailState("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const d = await res.json();
        setEmailState(!d.valid ? "invalid" : d.available ? "free" : "taken");
      } catch {
        setEmailState("idle");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [email]);

  // ---- password ----------------------------------------------------
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwInfo, setPwInfo] = useState<{ score: number; label: string; warnings: string[]; breached: boolean } | null>(
    null,
  );
  const [pwChecking, setPwChecking] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!pw) {
      setPwInfo(null);
      return;
    }
    setPwChecking(true);
    const t = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      try {
        const res = await fetch("/api/auth/check-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw, context: [email, company].filter(Boolean) }),
          signal: abort.current.signal,
        });
        setPwInfo(await res.json());
      } catch {
        /* ignore */
      } finally {
        setPwChecking(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [pw, email, company]);

  async function suggest() {
    try {
      const res = await fetch("/api/auth/generate-password");
      const d = await res.json();
      setPw(d.password);
      setPw2(d.password);
      setShowPw(true);
    } catch {
      /* ignore */
    }
  }

  const match = pw.length > 0 && pw === pw2;
  const canSubmit =
    emailState === "free" &&
    match &&
    (pwInfo?.score ?? 0) >= 2 &&
    !(pwInfo?.breached ?? false) &&
    (type === "freelancer" || company.trim().length >= 2);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-hairstrong p-1">
        {(["freelancer", "bedrijf"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
              type === t ? "bg-brand-500 text-white" : "text-neutralx-600 hover:text-ink"
            }`}
          >
            {t === "freelancer" ? "Ik zoek werk" : "Ik zoek mensen"}
          </button>
        ))}
      </div>

      {state.error && <p className="mb-4 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}

      {googleEnabled && (
        <>
          <form action={googleLoginAction}>
            <input type="hidden" name="callbackUrl" value="/start" />
            <GoogleButton label="Maak account met Google" />
          </form>
          <AuthDivider />
        </>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="type" value={type} />
        {type === "freelancer" && <input type="hidden" name="workerKind" value={workerKind} />}
        {type === "bedrijf" && <input type="hidden" name="kvkNumber" value={kvk} />}

        {type === "freelancer" && (
          <div>
            <span className="field-label">Je werkvorm</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {WORKER_KINDS.map((w) => (
                <button
                  key={w.k}
                  type="button"
                  onClick={() => setWorkerKind(w.k)}
                  className={`rounded-lg border px-2 py-2 text-center transition ${
                    workerKind === w.k ? "border-brand-500 bg-brand-50" : "border-hairstrong hover:border-brand-500"
                  }`}
                >
                  <span className="block text-xs font-semibold text-ink">{w.l}</span>
                  <span className="block text-[10px] leading-tight text-neutralx-500">{w.d}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {type === "bedrijf" && (
          <div className="relative">
            <span className="field-label">Organisatie {kvkConfigured && <span className="text-neutralx-400">(zoek in het Handelsregister)</span>}</span>
            <input
              name="companyName"
              required
              autoComplete="organization"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setKvk("");
              }}
              onFocus={() => kvkResults.length && setKvkOpen(true)}
              className="field-input"
              placeholder={kvkConfigured ? "Bijv. Horeca Groep NL" : "Naam organisatie"}
            />
            {kvk && (
              <p className="mt-1 text-xs text-ok">✓ KVK {kvk} — geverifieerd in het Handelsregister</p>
            )}
            {kvkOpen && kvkResults.length > 0 && !kvk && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-hairstrong bg-white shadow-lg">
                {kvkResults.map((r) => (
                  <li key={r.kvkNumber}>
                    <button
                      type="button"
                      onClick={() => {
                        setCompany(r.name);
                        setKvk(r.kvkNumber);
                        setKvkOpen(false);
                      }}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper-soft"
                    >
                      <span>
                        <span className="block font-medium text-ink">{r.name}</span>
                        {r.city && <span className="block text-xs text-neutralx-500">{r.city}</span>}
                      </span>
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] text-neutralx-400">{r.kvkNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label className="block">
          <span className="field-label">{type === "bedrijf" ? "Jouw naam" : "Volledige naam"}</span>
          <input name="fullName" required autoComplete="name" className="field-input" />
        </label>

        <label className="block">
          <span className="field-label">E-mailadres</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
          />
          {emailState === "checking" && <span className="mt-1 block text-xs text-neutralx-400">Controleren…</span>}
          {emailState === "free" && <span className="mt-1 block text-xs text-ok">✓ Dit e-mailadres is beschikbaar</span>}
          {emailState === "taken" && (
            <span className="mt-1 block text-xs text-crit">Er bestaat al een account met dit e-mailadres.</span>
          )}
          {emailState === "invalid" && <span className="mt-1 block text-xs text-crit">Vul een geldig e-mailadres in.</span>}
        </label>

        <label className="block">
          <span className="field-label">Telefoon <span className="text-neutralx-400">(optioneel)</span></span>
          <input name="phone" autoComplete="tel" className="field-input" />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="field-label">Wachtwoord</span>
            <button type="button" onClick={suggest} className="text-xs font-medium text-brand-600 hover:underline">
              Genereer sterk wachtwoord
            </button>
          </div>
          <span className="relative mt-1.5 block">
            <input
              type={showPw ? "text" : "password"}
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="field-input !mt-0 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Verbergen" : "Tonen"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-neutralx-400 hover:text-ink"
            >
              <EyeIcon off={showPw} />
            </button>
          </span>

          {pw && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < (pwInfo?.score ?? 0) ? STRENGTH_COLOR[pwInfo?.score ?? 0] : "bg-hairstrong"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-neutralx-500">
                {pwChecking ? "Controleren…" : `Sterkte: ${pwInfo?.label ?? "…"}`}
              </p>
              {pwInfo?.breached && (
                <p className="mt-1 text-xs font-medium text-crit">
                  Dit wachtwoord staat in bekende datalekken — kies een ander.
                </p>
              )}
              {!pwInfo?.breached &&
                pwInfo?.warnings?.slice(0, 1).map((w) => (
                  <p key={w} className="mt-1 text-xs text-warn">
                    {w}
                  </p>
                ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="field-label">Herhaal wachtwoord</span>
          <input
            type={showPw ? "text" : "password"}
            name="passwordConfirm"
            required
            minLength={8}
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="field-input"
          />
          {pw2 && (
            <span className={`mt-1 block text-xs ${match ? "text-ok" : "text-crit"}`}>
              {match ? "✓ Wachtwoorden komen overeen" : "De wachtwoorden komen niet overeen."}
            </span>
          )}
        </label>

        <SubmitButton type={type} disabled={!canSubmit} />
      </form>

      <p className="mt-4 text-xs leading-relaxed text-neutralx-400">
        Door een account aan te maken ga je akkoord met de{" "}
        <a href="/voorwaarden" className="underline">voorwaarden</a> en de{" "}
        <a href="/privacy" className="underline">privacyverklaring</a>.
        {type === "freelancer" && " Na aanmelding rond je je profiel af met je KVK en identiteitsverificatie."}
      </p>
    </div>
  );
}
