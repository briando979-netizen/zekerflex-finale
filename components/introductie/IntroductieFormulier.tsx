"use client";

import { useId, useState, type FormEvent } from "react";
import { INTRODUCTIE_NL, type IntroductieTeksten } from "@/lib/introducties/teksten";
import {
  BELONING_EURO,
  MAX_BEDRIJF,
  MAX_NAAM,
  controleerIntroductie,
  zonderBeloning,
  type IntroStatus,
  type IntroductieRegel,
  type IntroductieRol,
} from "@/lib/introducties/regels";
import { vulIn } from "@/lib/i18n/vul-in";
import { meldOntbreekt, meldVerstuurd } from "@/components/analytics/formulier";

// "Introduceer een bedrijf" (lib/introducties/regels.ts): het formulier en de eigen lijst met de stand per introductie.
// Gedeeld door de werkersapp (/dashboard/introduceren, vijf talen) en de werkgeversapp (/werkgever/introduceren): de
// pagina geeft de teksten mee, zonder blijft het Nederlands. inApp (Android en iPhone): geen woord over de beloning
// (lib/app-mode.ts). De knop staat altijd aan; wat ontbreekt zegt de melding (AGENTS.md, dode knoppen).

/** Kleur per stand: blauw = loopt, groen = gelukt, goud = geld onderweg, grijs = klaar zonder beloning. */
const KLEUR: Record<IntroStatus, string> = {
  ingediend: "bg-plan-soft text-plan-ink",
  benaderd: "bg-plan-soft text-plan-ink",
  klant: "bg-ok/10 text-ok",
  "beloning-onderweg": "bg-money-soft text-money-ink",
  "beloning-verstuurd": "bg-ok/10 text-ok",
  "al-klant": "bg-paper-soft text-neutralx-500",
  eerder: "bg-paper-soft text-neutralx-500",
  gestopt: "bg-paper-soft text-neutralx-500",
};

const LEEG = { contactNaam: "", bedrijf: "", email: "", telefoon: "" };

export function IntroductieFormulier({
  rol,
  inApp,
  initieel,
  texts = INTRODUCTIE_NL,
}: {
  rol: IntroductieRol;
  inApp: boolean;
  initieel: IntroductieRegel[];
  texts?: IntroductieTeksten;
}) {
  const t = texts;
  const id = useId();
  const [velden, setVelden] = useState(LEEG);
  const [toestemming, setToestemming] = useState(false);
  const [lijst, setLijst] = useState<IntroductieRegel[]>(initieel);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bedankt, setBedankt] = useState(false);
  const bedrag = String(BELONING_EURO);
  const zet = (k: keyof typeof LEEG, v: string) => setVelden((oud) => ({ ...oud, [k]: v }));

  function foutVanServer(status: number, data: unknown): string {
    if (status === 429) return t.teVaak;
    const veld = (data as { error?: { details?: { veld?: unknown } } } | null)?.error?.details?.veld;
    if (typeof veld === "string") {
      if (Object.hasOwn(t.ongeldig, veld)) return t.ongeldig[veld as keyof typeof t.ongeldig];
      if (Object.hasOwn(t.velden, veld)) return vulIn(t.vulNogIn, { velden: t.velden[veld as keyof typeof t.velden] });
    }
    return t.mislukt;
  }

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    setBedankt(false);
    const c = controleerIntroductie({ ...velden, toestemming });
    if (c.ontbreekt.length > 0) {
      for (const v of c.ontbreekt) meldOntbreekt("introductie", v.toLowerCase());
      setFout(vulIn(t.vulNogIn, { velden: c.ontbreekt.map((v) => t.velden[v]).join(", ") }));
      return;
    }
    const ongeldig = c.ongeldig[0];
    if (ongeldig) {
      setFout(t.ongeldig[ongeldig]);
      return;
    }
    setBezig(true);
    try {
      const res = await fetch("/api/me/introducties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol, ...velden, toestemming: true }),
      });
      const data = (await res.json().catch(() => null)) as { introducties?: IntroductieRegel[] } | null;
      if (!res.ok) {
        setFout(foutVanServer(res.status, data));
        return;
      }
      // de lijst van de server overnemen (met de stand die de server bepaalde)
      const nieuw = data?.introducties;
      if (Array.isArray(nieuw)) setLijst(nieuw);
      setVelden(LEEG);
      setToestemming(false);
      setBedankt(true);
      meldVerstuurd("introductie");
    } catch {
      setFout(t.mislukt);
    } finally {
      setBezig(false);
    }
  }

  const datum = (iso: string) => new Date(iso).toLocaleDateString(t.locale, { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-hair bg-white p-5 shadow-card">
        <ul className="space-y-1.5 text-sm text-ink">
          <li className="flex gap-2">
            <span className="text-ok" aria-hidden>✓</span>
            <span>{t.regelGratis}</span>
          </li>
          {!inApp && (
            <li className="flex gap-2">
              <span className="text-ok" aria-hidden>✓</span>
              <span>{vulIn(t.regelBeloning, { bedrag })}</span>
            </li>
          )}
          <li className="flex gap-2">
            <span className="text-ok" aria-hidden>✓</span>
            <span>{t.regelGegevens}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-ok" aria-hidden>✓</span>
            <span>{t.regelMens}</span>
          </li>
        </ul>
        {!inApp && <p className="mt-2 text-xs text-neutralx-500">{t.kleineLetters}</p>}

        <form onSubmit={verstuur} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor={`${id}-naam`} className="field-label">{t.naam}</label>
            <input
              id={`${id}-naam`}
              className="field-input"
              value={velden.contactNaam}
              onChange={(e) => zet("contactNaam", e.target.value)}
              maxLength={MAX_NAAM}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`${id}-bedrijf`} className="field-label">{t.bedrijf}</label>
            <input
              id={`${id}-bedrijf`}
              className="field-input"
              value={velden.bedrijf}
              onChange={(e) => zet("bedrijf", e.target.value)}
              maxLength={MAX_BEDRIJF}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`${id}-email`} className="field-label">{t.email}</label>
            <input
              id={`${id}-email`}
              type="email"
              inputMode="email"
              className="field-input"
              value={velden.email}
              onChange={(e) => zet("email", e.target.value)}
              maxLength={254}
              autoComplete="off"
              aria-describedby={`${id}-hint`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-tel`} className="field-label">{t.telefoon}</label>
            <div className="mt-1.5 flex items-stretch">
              <span className="grid place-items-center rounded-l-lg border border-r-0 border-hairstrong bg-paper-soft px-3 text-base text-neutralx-500" aria-hidden>
                +31
              </span>
              <input
                id={`${id}-tel`}
                type="tel"
                inputMode="tel"
                className="field-input mt-0 rounded-l-none"
                value={velden.telefoon}
                onChange={(e) => zet("telefoon", e.target.value)}
                maxLength={40}
                placeholder="6 12345678"
                autoComplete="off"
                aria-describedby={`${id}-hint`}
              />
            </div>
            <p id={`${id}-hint`} className="mt-1 text-xs text-neutralx-500">{t.contactHint}</p>
          </div>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 h-5 w-5 flex-shrink-0" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} />
            <span>{t.toestemming}</span>
          </label>

          {fout && (
            <p role="alert" className="rounded-lg bg-crit/5 px-4 py-2.5 text-sm text-crit">
              {fout}
            </p>
          )}
          {bedankt && (
            <p role="status" className="rounded-lg bg-ok/10 px-4 py-2.5 text-sm text-ok">
              {t.bedankt}
            </p>
          )}
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={bezig}>
            {bezig ? t.bezig : t.versturen}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-base font-bold text-ink">{t.lijstTitel}</h2>
        {lijst.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">{t.leeg}</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
            {lijst.map((i) => {
              const s = inApp ? zonderBeloning(i.status) : i.status;
              const extra = !inApp && Object.hasOwn(t.beloningUitleg, s) ? t.beloningUitleg[s as keyof typeof t.beloningUitleg] : null;
              return (
                <li key={i.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{i.bedrijf}</p>
                      <p className="text-xs text-neutralx-500">
                        {i.contactNaam} · {vulIn(t.ingediendOp, { datum: datum(i.at) })}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${KLEUR[s]}`}>{t.status[s]}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-neutralx-600">
                    {t.statusUitleg[s]}
                    {extra ? ` ${vulIn(extra, { bedrag })}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
