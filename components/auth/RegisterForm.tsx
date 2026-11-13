"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, type RegisterState } from "@/app/register/actions";
import { appleLoginAction, googleLoginAction } from "@/app/login/actions";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";
import { AppleButton } from "@/components/auth/AppleButton";
import { KvkZoeker } from "@/components/kvk/KvkZoeker";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";
import { BUITEN_LANDEN, EU_LANDEN } from "@/lib/onboarding/buitenland";
import { emailDomein, isGratisMail } from "@/lib/company/eigendom";
import { WERKRUIMTES, WERKRUIMTE_INFO, type Werkruimte } from "@/lib/werkgever/werkruimte";

const initial: RegisterState = { error: null };

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

function SubmitButton({ type, disabled, t }: { type: "freelancer" | "bedrijf"; disabled: boolean; t: (typeof AUTH_DICTS)["nl"]["register"] }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary w-full disabled:opacity-50">
      {pending ? t.busy : type === "bedrijf" ? t.submitCompany : t.submitWorker}
    </button>
  );
}

export function RegisterForm({
  locale = "nl",
  defaultType,
  defaultWorkerKind,
  prefill,
  defaultDashboard,
  googleEnabled,
  appleEnabled = false,
}: {
  locale?: Locale;
  defaultType: "freelancer" | "bedrijf";
  defaultWorkerKind?: "zzp" | "flexwerker" | "uitzendkracht";
  prefill?: { company?: string; kvk?: string; email?: string; name?: string };
  /** /register?dashboard=<soort>: de bezoeker koos al een product (webshop, rijschool, …) */
  defaultDashboard?: Werkruimte;
  googleEnabled: boolean;
  /** inloggen met Apple staat aan (lib/auth/apple.ts) */
  appleEnabled?: boolean;
}) {
  const t = AUTH_DICTS[locale].register;
  const or = AUTH_DICTS[locale].shell.or;
  const [type, setType] = useState<"freelancer" | "bedrijf">(defaultType);
  // De richting (ZZP'er, flexwerker, uitzendkracht) kies je na het aanmelden, in de start van de werker-app.
  // Komt de bezoeker via een pagina die al een richting noemt, dan gaat die mee.
  const [state, formAction] = useFormState(registerAction, initial);

  // ---- company (KVK) --------------------------------------------------
  const [company, setCompany] = useState(prefill?.company ?? "");
  const [kvk, setKvk] = useState(prefill?.kvk ?? "");
  // Een bedrijf buiten Nederland zoekt niet in het Handelsregister; het btw- of registratienummer volgt in de onboarding.
  const [land, setLand] = useState("NL");
  const nederlands = land === "NL";
  const [kvkViaZoeker, setKvkViaZoeker] = useState(false);
  // Het dashboard waarmee het bedrijf begint (lib/werkgever/werkruimte.ts); later voegt het er een toe.
  const [dashboard, setDashboard] = useState<Werkruimte>(defaultDashboard ?? "personeel");

  // ---- email availability -------------------------------------------
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [emailState, setEmailState] = useState<"idle" | "checking" | "free" | "taken" | "invalid" | "unavailable">("idle");
  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailState(email ? "invalid" : "idle");
      return;
    }
    setEmailState("checking");
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setEmailState("unavailable");
          return;
        }
        const d = await res.json();
        setEmailState(
          typeof d.valid !== "boolean" || typeof d.available !== "boolean"
            ? "unavailable"
            : !d.valid
              ? "invalid"
              : d.available
                ? "free"
                : "taken",
        );
      } catch {
        if (!controller.signal.aborted) setEmailState("unavailable");
      }
    }, 500);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [email]);

  // ---- password ----------------------------------------------------
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwInfo, setPwInfo] = useState<{ score: number; label: string; warnings: string[]; breached: boolean } | null>(
    null,
  );
  const [pwChecking, setPwChecking] = useState(false);
  const [pwCheckUnavailable, setPwCheckUnavailable] = useState(false);

  useEffect(() => {
    if (!pw) {
      setPwInfo(null);
      setPwCheckUnavailable(false);
      setPwChecking(false);
      return;
    }
    setPwInfo(null);
    setPwCheckUnavailable(false);
    setPwChecking(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw, context: [email, company].filter(Boolean) }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setPwCheckUnavailable(true);
          return;
        }
        const result: unknown = await res.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("score" in result) ||
          typeof result.score !== "number" ||
          !Number.isInteger(result.score) ||
          result.score < 0 ||
          result.score > 4 ||
          !("label" in result) ||
          typeof result.label !== "string" ||
          !("warnings" in result) ||
          !Array.isArray(result.warnings) ||
          !result.warnings.every((warning: unknown) => typeof warning === "string") ||
          !("breached" in result) ||
          typeof result.breached !== "boolean"
        ) {
          setPwCheckUnavailable(true);
          return;
        }
        setPwInfo({
          score: result.score,
          label: result.label,
          warnings: result.warnings,
          breached: result.breached,
        });
      } catch {
        if (!controller.signal.aborted) setPwCheckUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setPwChecking(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [pw, email, company]);

  async function suggest() {
    try {
      const res = await fetch("/api/auth/generate-password");
      const d = await res.json();
      if (!res.ok || typeof d?.password !== "string") throw new Error("geen wachtwoord");
      setPw(d.password);
      setShowPw(true);
    } catch {
      /* ignore */
    }
  }

  // Een gratis adres (gmail, hotmail, …) zegt niets over een bedrijf: dan staat de bezoeker onder werknemer,
  // tenzij hij zelf "personeel zoeken" koos of via een product (webshop, rijschool, …) kwam: een kleine
  // webwinkel gebruikt vaak gewoon gmail.
  const gratisMail = isGratisMail(emailDomein(email));
  const [bedrijfGekozen, setBedrijfGekozen] = useState(defaultDashboard !== undefined);
  const [naarWerk, setNaarWerk] = useState(false);
  useEffect(() => {
    if (gratisMail && type === "bedrijf" && !bedrijfGekozen) {
      setType("freelancer");
      setNaarWerk(true);
    }
  }, [gratisMail, type, bedrijfGekozen]);

  const sociaal = type === "freelancer";
  const canSubmit =
    (emailState === "free" || emailState === "unavailable") &&
    pw.length > 0 &&
    ((pwInfo?.score ?? 0) >= 2 || pwCheckUnavailable) &&
    !(pwInfo?.breached ?? false) &&
    (type === "freelancer" || company.trim().length >= 2);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-hairstrong p-1">
        {(["freelancer", "bedrijf"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={type === k}
            onClick={() => {
              setType(k);
              // Wie zelf "personeel zoeken" kiest, wordt niet meer teruggezet.
              if (k === "bedrijf") setBedrijfGekozen(true);
              setNaarWerk(false);
            }}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              type === k ? "bg-brand-500 text-white" : "text-neutralx-600 hover:text-ink"
            }`}
          >
            {k === "freelancer" ? t.seekWork : t.seekPeople}
          </button>
        ))}
      </div>

      {state.error && <p role="alert" className="mb-4 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}

      {naarWerk && (
        <p role="status" className="mb-4 rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-neutralx-700">
          Dit is geen zakelijk e-mailadres, dus we hebben je onder &ldquo;{t.seekWork}&rdquo; gezet. Wil je personeel zoeken? Kies dan &ldquo;{t.seekPeople}&rdquo; en gebruik bij voorkeur je zakelijke e-mailadres.
        </p>
      )}
      {type === "bedrijf" && bedrijfGekozen && gratisMail && (
        <p role="status" className="mb-4 rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-neutralx-700">
          Met een gratis e-mailadres controleert ZekerFlex je bedrijf met de hand. Met je zakelijke adres gaat dat sneller.
        </p>
      )}

      {/* Google en Apple maken altijd een werkersaccount (lib/auth/nextauth.ts): niet voor een bedrijf */}
      {sociaal && appleEnabled && (
        <form action={appleLoginAction}>
          <input type="hidden" name="callbackUrl" value="/start" />
          <AppleButton label={t.apple} />
        </form>
      )}
      {sociaal && googleEnabled && (
        <form action={googleLoginAction} className={appleEnabled ? "mt-3" : ""}>
          <input type="hidden" name="callbackUrl" value="/start" />
          <GoogleButton label={t.google} />
        </form>
      )}
      {sociaal && (googleEnabled || appleEnabled) && <AuthDivider label={or} />}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="type" value={type} />
        {type === "freelancer" && defaultWorkerKind && <input type="hidden" name="workerKind" value={defaultWorkerKind} />}
        {type === "bedrijf" && <input type="hidden" name="kvkNumber" value={kvk} />}

        {type === "bedrijf" && (
          <fieldset>
            <legend className="field-label">Waarvoor gebruik je ZekerFlex?</legend>
            <div className="mt-1.5 space-y-2">
              {WERKRUIMTES.map((w) => (
                <label
                  key={w}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                    dashboard === w ? "border-brand-500 bg-brand-50" : "border-hair hover:border-brand-500"
                  }`}
                >
                  <input type="radio" name="dashboard" value={w} required checked={dashboard === w} onChange={() => setDashboard(w)} className="mt-1 accent-brand-600" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{WERKRUIMTE_INFO[w].naam}</span>
                    <span className="block text-xs text-neutralx-600">{WERKRUIMTE_INFO[w].uitleg}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutralx-500">Je krijgt een eigen dashboard voor wat je kiest; later voeg je er makkelijk een toe.</p>
          </fieldset>
        )}

        {type === "bedrijf" && (
          <label className="block">
            <span className="field-label">Waar is je bedrijf gevestigd?</span>
            <select
              name="land"
              value={land}
              onChange={(e) => {
                setLand(e.target.value);
                setKvk("");
              }}
              className="field-input"
            >
              <option value="NL">Nederland</option>
              <optgroup label="Europese Unie">
                {EU_LANDEN.map((l) => <option key={l.code} value={l.code}>{l.naam}</option>)}
              </optgroup>
              <optgroup label="Buiten de EU">
                {BUITEN_LANDEN.map((l) => <option key={l.code} value={l.code}>{l.naam}</option>)}
              </optgroup>
            </select>
            {!nederlands && <span className="mt-1 block text-xs text-neutralx-400">Na het aanmelden vul je het btw- of registratienummer van je bedrijf in. ZekerFlex controleert je bedrijf daarna.</span>}
          </label>
        )}

        {type === "bedrijf" && (
          <div>
            {nederlands ? (
            <KvkZoeker
              label="Organisatie"
              name="companyName"
              required
              autoComplete="organization"
              placeholder="Bijv. Horeca Groep NL"
              value={company}
              onChange={setCompany}
              onKies={(t) => {
                setCompany(t.name);
                setKvk(t.kvkNumber ?? "");
                setKvkViaZoeker(t.source === "register");
              }}
              onWis={() => {
                setKvk("");
                setKvkViaZoeker(false);
              }}
              hint="Zoek in het Handelsregister op naam, plaats of KVK-nummer, of vul zelf in."
            />
            ) : (
              <label className="block">
                <span className="field-label">Organisatie</span>
                <input name="companyName" required autoComplete="organization" placeholder="Naam organisatie" value={company} onChange={(e) => setCompany(e.target.value)} className="field-input" />
              </label>
            )}
            {kvk && !kvkViaZoeker && <p className="mt-1 text-xs text-ok">KVK {kvk}</p>}
          </div>
        )}

        <label className="block">
          <span className="field-label">{type === "bedrijf" ? t.yourName : t.fullName}</span>
          <input name="fullName" required autoComplete="name" defaultValue={prefill?.name} className="field-input" />
        </label>

        <label className="block">
          <span className="field-label">{t.email}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailState === "taken" || emailState === "invalid"}
            aria-describedby="register-email-hint"
            className="field-input"
          />
          <span id="register-email-hint" role="status" aria-live="polite">
            {emailState === "checking" && <span className="mt-1 block text-xs text-neutralx-400">{t.checking}</span>}
            {emailState === "free" && <span className="mt-1 block text-xs text-ok">{t.emailFree}</span>}
            {emailState === "taken" && <span className="mt-1 block text-xs text-crit">{t.emailTaken}</span>}
            {emailState === "invalid" && <span className="mt-1 block text-xs text-crit">{t.emailInvalid}</span>}
            {emailState === "unavailable" && <span className="mt-1 block text-xs text-neutralx-500">{t.emailCheckUnavailable}</span>}
          </span>
        </label>

        <label className="block">
          <span className="field-label">{t.phone} <span className="text-neutralx-400">{t.optional}</span></span>
          <input name="phone" autoComplete="tel" className="field-input" />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="field-label">{t.password}</span>
            <button type="button" onClick={suggest} className="text-xs font-medium text-brand-600 hover:underline">
              {t.generate}
            </button>
          </div>
          <span className="relative mt-1.5 block">
            <input
              type={showPw ? "text" : "password"}
              name="password"
              aria-label={t.password}
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
              aria-label={showPw ? t.hide : t.show}
              aria-pressed={showPw}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-neutralx-400 hover:text-ink"
            >
              <EyeIcon off={showPw} />
            </button>
          </span>

          {pw && (
            <div className="mt-2" aria-live="polite">
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
                {pwChecking ? t.checking : `${t.strength}: ${pwInfo?.label ?? "…"}`}
              </p>
              {pwCheckUnavailable && !pwChecking && (
                <p className="mt-1 text-xs text-neutralx-500">{t.passwordCheckUnavailable}</p>
              )}
              {pwInfo?.breached && (
                <p className="mt-1 text-xs font-medium text-crit">
                  {t.breached}
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


        <SubmitButton type={type} disabled={!canSubmit} t={t} />
      </form>

      <p className="mt-4 text-xs leading-relaxed text-neutralx-400">
        {t.agree1}{" "}
        <Link href="/voorwaarden" className="underline">{t.terms}</Link> {t.and}{" "}
        <Link href="/privacy" className="underline">{t.privacy}</Link>.
        {type === "freelancer" && ` ${t.afterWorker}`}
      </p>
    </div>
  );
}
