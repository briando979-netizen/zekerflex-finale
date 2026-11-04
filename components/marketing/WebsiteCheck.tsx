"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NieuweSite, WebsiteCheckResult } from "@/lib/website-check/run";
import type { Finding, FindingStatus } from "@/lib/website-check/analyze";
import { PALETTEN, STIJL_KEUZES, overgenomenRegels } from "@/lib/website-check/stijl-keuze";

export interface PlanCard {
  key: "basis" | "pro";
  label: string;
  price: string;
  blurb: string;
  features: readonly string[];
}

const STEPS = ["Website openen", "Snelheid meten", "Instellingen voor Google bekijken", "Beveiliging controleren", "Links nalopen", "Rapport maken"];

const STATUS: Record<FindingStatus, { label: string; pill: string }> = {
  probleem: { label: "Probleem", pill: "pill-crit" },
  "let-op": { label: "Let op", pill: "pill-warn" },
  goed: { label: "Goed", pill: "pill-ok" },
};

function tone(score: number): { label: string; color: string; pill: string } {
  if (score >= 80) return { label: "Goed", color: "#15803D", pill: "pill-ok" };
  if (score >= 50) return { label: "Kan beter", color: "#B45309", pill: "pill-warn" };
  return { label: "Slecht", color: "#B91C1C", pill: "pill-crit" };
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("nl-NL")} kB`;
const sec = (ms: number) => `${(ms / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} s`;

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />;
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const t = tone(score);
  return (
    <div className="relative h-36 w-36 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E6E7E1" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={t.color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${((score / 100) * c).toFixed(1)} ${c.toFixed(1)}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="num font-display text-4xl font-bold text-ink">{score}</p>
          <p className="text-xs text-neutralx-500">van 100</p>
        </div>
      </div>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const s = STATUS[f.status];
  return (
    <li className="flex flex-col gap-2 border-t border-hair px-5 py-4 first:border-t-0 sm:flex-row sm:items-start sm:gap-4">
      <span className={`${s.pill} w-fit flex-shrink-0 sm:mt-0.5 sm:w-24 sm:justify-center`}>
        <Dot />
        {s.label}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{f.title}</p>
        <p className="mt-0.5 break-words text-sm leading-relaxed text-neutralx-600">{f.detail}</p>
      </div>
    </li>
  );
}

const BOUW_STAPPEN = ["Je website lezen", "Je andere pagina's lezen", "Teksten, foto's en openingstijden ophalen", "Logo en kleuren overnemen", "Pagina's opbouwen", "Je nieuwe website meten"];

const dag = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long" });

/** Meer opties: een andere stijl of kleuren, meteen toegepast op de voorbeeldsite (POST /api/website-check/website/stijl). */
function StijlKiezer({ checkId, site, onSite }: { checkId: string; site: NieuweSite; onSite: (s: NieuweSite) => void }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const stijl = site.stijl ?? "beleving";
  const palet = site.palet ?? "eigen";

  async function kies(nieuweStijl: string, nieuwPalet: string) {
    if (nieuweStijl === stijl && nieuwPalet === palet) return;
    setBezig(`${nieuweStijl}:${nieuwPalet}`);
    setMelding(null);
    try {
      const res = await fetch("/api/website-check/website/stijl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId, stijl: nieuweStijl, palet: nieuwPalet }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.site) {
        setMelding({ ok: false, tekst: data?.error?.message ?? "Dat lukte niet. Probeer het opnieuw." });
        return;
      }
      onSite(data.site as NieuweSite);
      setMelding({ ok: true, tekst: "Aangepast. Open je nieuwe website (of ververs hem) om het te zien." });
    } catch {
      setMelding({ ok: false, tekst: "Geen verbinding. Probeer het opnieuw." });
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="mt-6 border-t border-hair pt-5">
      <p className="text-sm font-semibold text-ink">Probeer een andere stijl</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Stijl van je nieuwe website">
        {STIJL_KEUZES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={stijl === s.id}
            disabled={bezig !== null}
            onClick={() => void kies(s.id, palet)}
            className={`rounded-xl border-2 p-3 text-left text-sm transition ${stijl === s.id ? "border-brand-600 bg-brand-50" : "border-hair hover:border-brand-500"}`}
          >
            <span className="block font-semibold text-ink">{s.naam}</span>
            <span className="mt-0.5 block text-xs text-neutralx-600">{s.uitleg}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm font-semibold text-ink">Kleuren</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Kleuren van je nieuwe website">
        {PALETTEN.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={palet === p.id}
            disabled={bezig !== null}
            onClick={() => void kies(stijl, p.id)}
            className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-medium text-ink transition ${palet === p.id ? "border-brand-600 bg-brand-50" : "border-hair hover:border-brand-500"}`}
          >
            <span className="flex" aria-hidden>
              <span className="h-4 w-4 rounded-full border border-white" style={{ background: p.kleur ?? site.eigen?.kleur ?? "#325A46" }} />
              <span className="-ml-1.5 h-4 w-4 rounded-full border border-white" style={{ background: p.accent ?? site.eigen?.accent ?? "#FF5F1F" }} />
            </span>
            {p.naam}
          </button>
        ))}
      </div>
      {bezig && (
        <p role="status" className="mt-3 text-xs text-neutralx-600">
          Je website wordt aangepast…
        </p>
      )}
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 text-xs ${melding.ok ? "text-ok" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}

/** "Maak mijn nieuwe website": van de gecheckte site een nieuwe in de stijl van schwarzwald.zekerflex.com. */
function NieuweSiteBlok({ result, site, onSite }: { result: WebsiteCheckResult; site: NieuweSite | null; onSite: (s: NieuweSite) => void }) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, BOUW_STAPPEN.length - 1)), 5000);
    return () => clearInterval(t);
  }, [busy]);

  async function maak() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/website-check/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: result.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.site) {
        setErr(data?.error?.message ?? "Het maken is niet gelukt. Probeer het opnieuw.");
        return;
      }
      onSite(data.site as NieuweSite);
    } catch {
      setErr("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  const t = tone(result.score);
  return (
    <section className="border-t border-hair bg-white" id="nieuwe-website" aria-labelledby="nieuwe-website-kop">
      <div className="shell grid gap-10 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow text-brand-700">Gratis: je nieuwe website</p>
          <h2 id="nieuwe-website-kop" className="mt-3 text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Zo kan {result.host} eruitzien
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-neutralx-600">
            We maken in een halve minuut een nieuwe website van je eigen teksten, foto&apos;s en logo. Snel, goed vindbaar en veilig, met een opening vol foto&apos;s en grote koppen, net als{" "}
            <a href="https://schwarzwald.zekerflex.com/" target="_blank" rel="noopener" className="font-semibold text-brand-700 underline underline-offset-2">
              schwarzwald.zekerflex.com
            </a>
            .
          </p>
          <ul className="mt-5 space-y-1.5 text-sm text-neutralx-600">
            {["Je eigen teksten, foto's, logo, diensten en openingstijden, van al je pagina's", "Kies zelf de stijl en kleuren", "Werkt op elke telefoon, zonder trage scripts", "Contactformulier, WhatsApp en privacyverklaring erbij"].map((x) => (
              <li key={x} className="flex gap-2">
                <span className="text-brand-700" aria-hidden>✓</span>
                {x}
              </li>
            ))}
          </ul>
        </div>

        <div className="surface p-6">
          {site ? (
            <div>
              <p className="text-sm font-semibold text-ink">Je nieuwe website staat klaar</p>
              {site.score !== null && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-hair p-4">
                    <p className="text-xs text-neutralx-500">Nu</p>
                    <p className="num font-display text-3xl font-bold" style={{ color: t.color }}>
                      {result.score}
                      <span className="text-sm font-medium text-neutralx-500"> van 100</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-hair p-4">
                    <p className="text-xs text-neutralx-500">Nieuwe website</p>
                    <p className="num font-display text-3xl font-bold" style={{ color: tone(site.score).color }}>
                      {site.score}
                      <span className="text-sm font-medium text-neutralx-500"> van 100</span>
                    </p>
                  </div>
                </div>
              )}
              {site.overgenomen && overgenomenRegels(site.overgenomen).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Dit namen we over van je website</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {overgenomenRegels(site.overgenomen).map((r) => (
                      <li key={r} className="pill-ok">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={`/site/${site.slug}`} target="_blank" rel="noopener" className="btn-primary">
                  Bekijk je nieuwe website
                </a>
                <a href="#oplossen" className="btn-ghost">
                  Ik wil deze website
                </a>
              </div>
              {site.overgenomen ? (
                <StijlKiezer checkId={result.id} site={site} onSite={onSite} />
              ) : (
                <div className="mt-5 rounded-xl border border-hair p-4">
                  <p className="text-sm font-semibold text-ink">Er is een betere versie</p>
                  <p className="mt-1 text-sm text-neutralx-600">We lezen nu al je pagina&apos;s, met je echte openingstijden en meer foto&apos;s, en je kiest zelf de stijl.</p>
                  <button type="button" onClick={maak} disabled={busy} className="btn-primary mt-3">
                    {busy ? `${BOUW_STAPPEN[step]}…` : "Maak hem opnieuw"}
                  </button>
                  {err && (
                    <p role="alert" className="mt-3 text-sm text-crit">
                      {err}
                    </p>
                  )}
                </div>
              )}
              <p className="mt-4 text-xs leading-relaxed text-neutralx-500">
                Dit is een ontwerpvoorstel: niet vindbaar in Google, het formulier verstuurt nog niets en hij blijft staan tot {dag(site.verloopt)}. Zeg je ja, dan zetten we hem op je eigen adres.
              </p>
            </div>
          ) : busy ? (
            <div role="status" aria-live="polite">
              <p className="text-sm font-medium text-ink">{BOUW_STAPPEN[step]}…</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-soft">
                <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${Math.round(((step + 1) / BOUW_STAPPEN.length) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-neutralx-500">Dit duurt meestal 20 tot 40 seconden.</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-ink">Gratis en zonder account</p>
              <p className="mt-1 text-sm text-neutralx-600">Je ziet hem meteen. Pas als je ja zegt, nemen we contact op.</p>
              <button type="button" onClick={maak} className="btn-primary mt-5 w-full">
                Maak mijn nieuwe website
              </button>
              {err && (
                <p role="alert" className="mt-3 text-sm text-crit">
                  {err}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LeadForm({ result, plans }: { result: WebsiteCheckResult; plans: PlanCard[] }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [plan, setPlan] = useState<"basis" | "pro" | "advies">("advies");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(Boolean(result.leadId));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErr("Zet het vinkje, dan mogen we contact met je opnemen.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/website-check/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId: result.id,
          name: form.name,
          email: form.email,
          ...(form.phone.trim() ? { phone: form.phone } : {}),
          ...(form.company.trim() ? { company: form.company } : {}),
          plan,
          consent: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error?.message ?? "Versturen mislukt. Probeer het opnieuw.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm text-ink";

  return (
    <section className="hero-ink text-white" id="oplossen">
      <div className="shell grid gap-10 py-16 md:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <div>
          <p className="eyebrow text-brand-mint">Website-beheer door ZekerFlex</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-tight md:text-4xl">Laat ons dit voor je oplossen</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/70">
            We pakken de punten uit dit rapport aan en houden je website daarna bij. Per maand opzegbaar.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {plans.map((p) => (
              <div key={p.key} className="rounded-2xl border border-white/15 bg-white/[0.04] p-5">
                <p className="text-sm font-semibold text-white">{p.label}</p>
                <p className="mt-1 font-display text-2xl font-bold text-brand-mint">
                  {p.price}
                  <span className="text-sm font-medium text-white/60"> per maand</span>
                </p>
                <p className="mt-2 text-sm text-white/65">{p.blurb}</p>
                <ul className="mt-3 space-y-1.5">
                  {p.features.map((x) => (
                    <li key={x} className="flex gap-2 text-sm text-white/80">
                      <span className="text-brand-mint" aria-hidden>✓</span>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-hair bg-white p-6 text-ink shadow-e2">
          {done ? (
            <div role="status" className="py-8 text-center">
              <p className="font-display text-2xl font-bold text-ink">Bedankt, we nemen contact op</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-neutralx-600">
                Binnen één werkdag hoor je van ons over {result.host}. Je rapport hebben we je ook gemaild.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <p className="text-sm font-semibold text-ink">Vrijblijvend contact over {result.host}</p>
              <p className="text-xs text-neutralx-500">We bellen of mailen je binnen één werkdag.</p>
              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-ink">Waar heb je interesse in?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["advies", "Eerst advies"],
                      ["basis", plans.find((p) => p.key === "basis")?.label ?? "Basis"],
                      ["pro", plans.find((p) => p.key === "pro")?.label ?? "Pro"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${plan === key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong text-ink hover:bg-paper-soft"}`}>
                      <input type="radio" name="plan" value={key} checked={plan === key} onChange={() => setPlan(key)} className="sr-only" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-ink">Naam *</span>
                  <input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink">Bedrijfsnaam</span>
                  <input autoComplete="organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink">E-mailadres *</span>
                  <input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink">Telefoon</span>
                  <input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
                </label>
              </div>
              <label className="mt-4 flex items-start gap-2 text-xs text-neutralx-600">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>
                  ZekerFlex mag contact met me opnemen over deze website-check. Zie de{" "}
                  <Link href="/privacy" className="underline">privacyverklaring</Link>.
                </span>
              </label>
              {err && (
                <p role="alert" className="mt-3 text-sm text-crit">
                  {err}
                </p>
              )}
              <button type="submit" disabled={busy || !form.name.trim() || !form.email.trim()} className="btn-primary mt-5 w-full">
                {busy ? "Versturen…" : "Neem contact met me op"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/** De nieuwe website bij een rapport, zolang hij nog staat. */
const geldigeSite = (r: WebsiteCheckResult | null) => (r?.nieuweSite && Date.parse(r.nieuweSite.verloopt) > Date.now() ? r.nieuweSite : null);

export function WebsiteCheck({ initial, plans }: { initial: WebsiteCheckResult | null; plans: PlanCard[] }) {
  const [url, setUrl] = useState(initial?.host ?? "");
  const [result, setResult] = useState<WebsiteCheckResult | null>(initial);
  const [site, setSite] = useState<NieuweSite | null>(() => geldigeSite(initial));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, [busy]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/website-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.result) {
        setErr(data?.error?.message ?? "De check is niet gelukt. Probeer het opnieuw.");
        return;
      }
      const r = data.result as WebsiteCheckResult;
      setResult(r);
      setSite(geldigeSite(r));
      window.history.replaceState(null, "", `/website-check?r=${r.id}`);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErr("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/website-check?r=${result.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* geen klembord: niets doen */
    }
  }

  const order: FindingStatus[] = ["probleem", "let-op"];
  const open = result ? order.flatMap((s) => result.findings.filter((f) => f.status === s)) : [];
  const good = result ? result.findings.filter((f) => f.status === "goed") : [];
  const problems = result ? result.findings.filter((f) => f.status === "probleem").length : 0;
  const t = result ? tone(result.score) : null;

  return (
    <>
      <section className="hero-ink text-white">
        <div className="shell py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand-mint">Gratis website-check</p>
            <h1 className="mt-4 text-balance font-display text-4xl font-bold leading-[1.08] md:text-5xl">Hoe goed doet je website het?</h1>
            <p className="mt-6 text-lg leading-relaxed text-white/70">
              Vul je adres in en zie binnen een halve minuut hoe snel, vindbaar en veilig je website is. Gratis en zonder account.
            </p>
          </div>
          <form onSubmit={run} className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row" role="search" aria-label="Website controleren">
            <label htmlFor="wc-url" className="sr-only">Adres van je website</label>
            <input
              id="wc-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="jouwbedrijf.nl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-white px-5 py-3 text-base text-ink placeholder:text-neutralx-400"
            />
            <button type="submit" disabled={busy || !url.trim()} className="btn-mint px-7 py-3 text-base">
              {busy ? "Bezig…" : "Check mijn website"}
            </button>
          </form>
          {busy && (
            <div role="status" aria-live="polite" className="mt-6 max-w-2xl rounded-2xl border border-white/15 bg-white/[0.05] p-5">
              <p className="text-sm font-medium text-white">{STEPS[step]}…</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-mint transition-[width] duration-700" style={{ width: `${Math.round(((step + 1) / STEPS.length) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-white/55">Dit duurt meestal 10 tot 30 seconden.</p>
            </div>
          )}
          {err && !busy && (
            <p role="alert" className="mt-6 max-w-2xl rounded-2xl border border-white/15 bg-white/[0.06] p-4 text-sm text-white">
              {err}
            </p>
          )}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            {["Snelheid", "Telefoon", "Vindbaar in Google", "Veiligheid", "Kapotte links"].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="text-brand-mint" aria-hidden>✓</span>
                {x}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {result && t && (
        <>
          <div ref={resultsRef} className="scroll-mt-20 bg-paper">
            <div className="shell py-12 md:py-16">
              <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                <div className="surface flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
                  <ScoreRing score={result.score} />
                  <div className="min-w-0">
                    <span className={t.pill}>
                      <Dot />
                      {t.label}
                    </span>
                    <h2 className="mt-2 break-words font-display text-2xl font-bold text-ink">{result.host}</h2>
                    <p className="mt-1 text-sm text-neutralx-600">
                      {problems === 0
                        ? open.length === 0
                          ? "Geen problemen gevonden."
                          : `Geen grote problemen, wel ${open.length} ${open.length === 1 ? "aandachtspunt" : "aandachtspunten"}.`
                        : `${problems} ${problems === 1 ? "probleem" : "problemen"} en ${open.length - problems} ${open.length - problems === 1 ? "aandachtspunt" : "aandachtspunten"}.`}
                      {result.platform ? ` Gemaakt met ${result.platform}.` : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href="#nieuwe-website" className="btn-primary">{site ? "Bekijk je nieuwe website" : "Maak je nieuwe website"}</a>
                      <a href="#oplossen" className="btn-ghost">Laat het oplossen</a>
                      <button type="button" onClick={share} className="btn-ghost">
                        {copied ? "Link gekopieerd" : "Deel dit rapport"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="surface p-6">
                  <p className="text-sm font-semibold text-ink">Per onderdeel</p>
                  <ul className="mt-4 space-y-3">
                    {result.categories.map((c) => {
                      const ct = tone(c.score);
                      return (
                        <li key={c.id}>
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="text-neutralx-600">{c.label}</span>
                            <span className="num font-semibold text-ink">{c.score}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-soft" role="progressbar" aria-label={c.label} aria-valuenow={c.score} aria-valuemin={0} aria-valuemax={100}>
                            <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: ct.color }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-3 lg:grid-cols-5">
                {[
                  ["Server-reactie", sec(result.metrics.ttfbMs)],
                  ["Pagina", kb(result.metrics.htmlBytes)],
                  ["Scripts", String(result.metrics.scripts)],
                  ["Afbeeldingen", String(result.metrics.images)],
                  ["Links gecontroleerd", `${result.metrics.linksChecked}${result.metrics.brokenLinks ? `, ${result.metrics.brokenLinks} kapot` : ""}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-4 py-3">
                    <dt className="text-xs text-neutralx-500">{label}</dt>
                    <dd className="num mt-0.5 text-lg font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              {open.length > 0 && (
                <div className="mt-8">
                  <h3 className="font-display text-xl font-bold text-ink">Wat beter kan</h3>
                  <ul className="mt-3 overflow-hidden rounded-2xl border border-hair bg-white">
                    {open.map((f) => (
                      <FindingRow key={f.id} f={f} />
                    ))}
                  </ul>
                </div>
              )}
              {good.length > 0 && (
                <details className="mt-6 overflow-hidden rounded-2xl border border-hair bg-white">
                  <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-ink">Wat al goed gaat ({good.length})</summary>
                  <ul className="border-t border-hair">
                    {good.map((f) => (
                      <FindingRow key={f.id} f={f} />
                    ))}
                  </ul>
                </details>
              )}
              <p className="mt-6 text-xs text-neutralx-500">
                Gemeten op {new Date(result.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} vanaf onze server in Nederland: de pagina {result.finalUrl} en tot 20 links daarop. Een snelle check, geen volledige audit.
              </p>
            </div>
          </div>
          <NieuweSiteBlok result={result} site={site} onSite={setSite} />
          <LeadForm result={result} plans={plans} />
        </>
      )}
    </>
  );
}
