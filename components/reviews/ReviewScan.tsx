"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { MAX_DOEL_REVIEWS, MAX_PER_MAAND, cijfer, getal, type Voorstel, type VoorstelActie } from "@/lib/review-scan/model";
import type { ReviewScanRapport } from "@/lib/review-scan/run";
import type { Kandidaat } from "@/lib/review-scan/places";

// ---------------------------------------------------------------------------
// Review-scan: het bedrijf vult zijn Google-link, website of naam + plaats in
// en krijgt een score, de vergelijking met de buurt, wat klanten zeggen,
// verbetervoorstellen en per review een antwoordvoorstel (POST /api/review-scan).
// Openbaar op /review-check (met aanvraagformulier) en in de werkgeversomgeving
// boven Google-reviews (dan wijzen de knoppen naar de eigen functies).
// ---------------------------------------------------------------------------

type Variant = "openbaar" | "werkgever";

const ACTIE: Record<Variant, Record<VoorstelActie, { label: string; href: string; extern?: boolean }>> = {
  openbaar: {
    verzoeken: { label: "Start gratis met review-verzoeken", href: "/register?type=bedrijf" },
    antwoorden: { label: "Naar de antwoordvoorstellen", href: "#antwoorden" },
    profiel: { label: "Open je Google-bedrijfsprofiel", href: "https://business.google.com/", extern: true },
    website: { label: "Doe de gratis website-check", href: "/website-check" },
  },
  werkgever: {
    verzoeken: { label: "Vraag klanten om een review", href: "#verzoeken" },
    antwoorden: { label: "Naar de antwoordvoorstellen", href: "#antwoorden" },
    profiel: { label: "Open je Google-bedrijfsprofiel", href: "https://business.google.com/", extern: true },
    website: { label: "Naar je website", href: "/werkgever/website" },
  },
};

const IMPACT = {
  hoog: { label: "Eerst doen", klasse: "pill-warn" },
  middel: { label: "Daarna", klasse: "pill" },
  laag: { label: "Als je tijd hebt", klasse: "pill" },
} as const;

async function foutTekst(res: Response | null, standaard: string): Promise<string> {
  if (!res) return "Geen verbinding. Probeer het opnieuw.";
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? standaard;
}

export function ReviewScan({ variant, initial = null, startInvoer = "", initialDealId = null }: { variant: Variant; initial?: ReviewScanRapport | null; startInvoer?: string; initialDealId?: string | null }) {
  // het voorstel op maat bij deze scan (lib/scans), alleen op de openbare pagina
  const [dealId, setDealId] = useState<string | null>(initialDealId);
  const id = useId();
  const [invoer, setInvoer] = useState(startInvoer);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [kandidaten, setKandidaten] = useState<Kandidaat[] | null>(null);
  const [rapport, setRapport] = useState<ReviewScanRapport | null>(initial);

  const scan = async (body: { tekst?: string; placeId?: string }) => {
    setBezig(true);
    setFout(null);
    setKandidaten(null);
    const res = await fetch("/api/review-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      setFout(await foutTekst(res, "De scan lukte niet. Probeer het opnieuw."));
      setBezig(false);
      return;
    }
    const data = (await res.json()) as ({ soort: "rapport"; rapport: ReviewScanRapport } | { soort: "kies"; kandidaten: Kandidaat[] }) & { dealId?: string | null };
    setDealId(typeof data.dealId === "string" ? data.dealId : null);
    if (data.soort === "kies") setKandidaten(data.kandidaten);
    else {
      setRapport(data.rapport);
      if (variant === "openbaar") {
        try {
          window.history.replaceState(null, "", `/review-check?r=${data.rapport.id}`);
        } catch {
          /* geen geschiedenis: niet erg */
        }
      }
    }
    setBezig(false);
  };

  const verstuur = (e: FormEvent) => {
    e.preventDefault();
    if (invoer.trim().length < 3) {
      setFout("Vul je Google-link, website of bedrijfsnaam met plaats in.");
      return;
    }
    void scan({ tekst: invoer.trim() });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={verstuur} className="card p-5 sm:p-6" aria-busy={bezig}>
        <label htmlFor={`${id}-invoer`} className="block font-display text-lg font-bold text-ink">
          {variant === "werkgever" ? "Scan je bedrijf op Google" : "Je Google-link, website of bedrijfsnaam"}
        </label>
        <p id={`${id}-hint`} className="mt-1 text-sm text-neutralx-600">
          Plak de link naar je bedrijf op Google Maps of het adres van je website, of typ je bedrijfsnaam en plaats (bijvoorbeeld &quot;Bakkerij Jansen Utrecht&quot;).
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            id={`${id}-invoer`}
            className="field-input min-w-0 flex-1"
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            placeholder="maps.app.goo.gl/… of jouwbedrijf.nl of Bakkerij Jansen Utrecht"
            aria-describedby={`${id}-hint`}
            maxLength={500}
            autoComplete="off"
          />
          <button type="submit" className="btn-primary flex-shrink-0" disabled={bezig}>
            {bezig ? "Bezig met scannen…" : "Scan mijn reviews"}
          </button>
        </div>
        {bezig && (
          <p role="status" className="mt-3 text-sm text-neutralx-600">
            We zoeken je bedrijf op Google, lezen je reviews en vergelijken je met de buurt. Dat duurt zo&apos;n 10 tot 20 seconden.
          </p>
        )}
        {fout && (
          <p role="alert" className="mt-3 text-sm text-crit">
            {fout}
          </p>
        )}
      </form>

      {kandidaten && <Kiezen kandidaten={kandidaten} onKies={(placeId) => void scan({ placeId })} bezig={bezig} />}
      {rapport && !kandidaten && <Rapport rapport={rapport} variant={variant} dealId={variant === "openbaar" ? dealId : null} />}
    </div>
  );
}

function Kiezen({ kandidaten, onKies, bezig }: { kandidaten: Kandidaat[]; onKies: (placeId: string) => void; bezig: boolean }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="rs-kies">
      <h2 id="rs-kies" className="font-display text-lg font-bold text-ink">
        Welk bedrijf is van jou?
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">We vonden meer bedrijven die erop lijken.</p>
      <ul className="mt-4 space-y-2">
        {kandidaten.map((k) => (
          <li key={k.placeId}>
            <button
              type="button"
              disabled={bezig}
              onClick={() => onKies(k.placeId)}
              className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-hair bg-white px-4 py-3 text-left transition hover:border-brand-500 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{k.naam}</span>
                <span className="block break-words text-sm text-neutralx-600">{k.adres}</span>
              </span>
              <span className="flex-shrink-0 text-sm text-neutralx-600">{k.rating !== null ? `${cijfer(k.rating)} ★ · ${getal(k.aantal)} reviews` : "nog geen reviews"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sterren({ n }: { n: number }) {
  return (
    <span aria-label={`${n} van 5 sterren`} className="whitespace-nowrap text-ink">
      <span aria-hidden>{"★".repeat(n)}</span>
      <span aria-hidden className="text-neutralx-300">
        {"★".repeat(Math.max(0, 5 - n))}
      </span>
    </span>
  );
}

function ScoreCirkel({ score, oordeel }: { score: number; oordeel: string }) {
  const kleur = score >= 70 ? "#0E7A4E" : score >= 50 ? "#B45309" : "#B91C1C";
  const omtrek = 2 * Math.PI * 42;
  return (
    <div className="flex flex-shrink-0 items-center gap-3">
      <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`Reviewscore ${score} van 100: ${oordeel}`}>
        <circle cx="52" cy="52" r="42" fill="none" stroke="currentColor" strokeWidth="10" className="text-hair" />
        <circle cx="52" cy="52" r="42" fill="none" stroke={kleur} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * omtrek} ${omtrek}`} transform="rotate(-90 52 52)" />
        <text x="52" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor" className="text-ink">
          {score}
        </text>
      </svg>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Reviewscore</p>
        <p className="font-display text-xl font-bold text-ink">{oordeel}</p>
      </div>
    </div>
  );
}

function VoorstelKaart({ v, variant }: { v: Voorstel; variant: Variant }) {
  const actie = v.actie ? ACTIE[variant][v.actie] : null;
  return (
    <li className="rounded-2xl border border-hair bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-ink">{v.titel}</h3>
        <span className={`${IMPACT[v.impact].klasse} flex-shrink-0`}>{IMPACT[v.impact].label}</span>
      </div>
      <p className="mt-1 text-sm text-neutralx-600">{v.uitleg}</p>
      {actie &&
        (actie.extern ? (
          <a href={actie.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
            {actie.label} ↗
          </a>
        ) : (
          <Link href={actie.href} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
            {actie.label} →
          </Link>
        ))}
    </li>
  );
}

function Antwoord({ tekst }: { tekst: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div className="mt-3 rounded-xl bg-paper-soft p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Voorstel voor je antwoord</p>
      <p className="mt-1 whitespace-pre-line text-sm text-ink">{tekst}</p>
      <button
        type="button"
        className="mt-2 text-sm font-semibold text-brand-600 hover:underline"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(tekst)
            .then(() => setGekopieerd(true))
            .catch(() => setGekopieerd(false));
        }}
      >
        {gekopieerd ? "Gekopieerd ✓" : "Kopieer antwoord"}
      </button>
    </div>
  );
}

function Aanvraag({ scanId }: { scanId: string }) {
  const id = useId();
  const [f, setF] = useState({ name: "", email: "", phone: "", consent: false });
  const [stand, setStand] = useState<"open" | "bezig" | "klaar">("open");
  const [fout, setFout] = useState<string | null>(null);
  const stuur = async (e: FormEvent) => {
    e.preventDefault();
    setStand("bezig");
    setFout(null);
    const res = await fetch("/api/review-scan/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanId, name: f.name, email: f.email, ...(f.phone.trim() ? { phone: f.phone } : {}), consent: f.consent }),
    }).catch(() => null);
    if (!res?.ok) {
      setFout(await foutTekst(res, "Versturen lukte niet. Probeer het opnieuw."));
      setStand("open");
      return;
    }
    setStand("klaar");
  };
  if (stand === "klaar") {
    return (
      <p role="status" className="card p-5 text-sm text-ink">
        Bedankt! We nemen binnen één werkdag contact met je op. Je rapport staat ook in je mail.
      </p>
    );
  }
  return (
    <form onSubmit={stuur} className="card p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">Hulp nodig bij je reviews?</h2>
      <p className="mt-1 text-sm text-neutralx-600">Laat je gegevens achter. We bellen of mailen je over de punten uit dit rapport, vrijblijvend.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-neutralx-700" htmlFor={`${id}-naam`}>
          Naam
          <input id={`${id}-naam`} className="field-input mt-1" required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        </label>
        <label className="text-sm text-neutralx-700" htmlFor={`${id}-mail`}>
          E-mailadres
          <input id={`${id}-mail`} className="field-input mt-1" type="email" required maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </label>
        <label className="text-sm text-neutralx-700" htmlFor={`${id}-tel`}>
          Telefoon (mag leeg)
          <input id={`${id}-tel`} className="field-input mt-1" type="tel" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-neutralx-700">
        <input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5" />
        <span>
          ZekerFlex mag contact met me opnemen over deze aanvraag (zie de{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            privacyverklaring
          </Link>
          ).
        </span>
      </label>
      {fout && (
        <p role="alert" className="mt-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <button type="submit" className="btn-primary mt-4" disabled={stand === "bezig"}>
        {stand === "bezig" ? "Versturen…" : "Neem contact met me op"}
      </button>
    </form>
  );
}

function Rapport({ rapport: r, variant, dealId }: { rapport: ReviewScanRapport; variant: Variant; dealId: string | null }) {
  const gescand = new Date(r.at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  // ook voor rapporten van vóór de grens: geen onhaalbare doelen tonen
  const doel = r.doel && r.doel.nodig > 0 && r.doel.nodig <= MAX_DOEL_REVIEWS ? r.doel : null;
  const inhalen = r.inhalen && r.inhalen.perMaand <= MAX_PER_MAAND ? r.inhalen : null;
  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6" aria-labelledby="rs-kop">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{r.bedrijf.categorie ?? "Review-scan"}</p>
            <h2 id="rs-kop" className="mt-1 break-words font-display text-2xl font-bold text-ink">
              {r.bedrijf.naam}
            </h2>
            <p className="break-words text-sm text-neutralx-600">{r.bedrijf.adres}</p>
            <p className="mt-2 text-sm text-ink">
              {r.rating !== null ? (
                <>
                  <strong>{cijfer(r.rating)}</strong> <Sterren n={Math.round(r.rating)} /> · {getal(r.aantal)} {r.aantal === 1 ? "review" : "reviews"} op Google
                </>
              ) : (
                "Nog geen reviews op Google"
              )}
            </p>
            {r.bedrijf.mapsUrl && (
              <a href={r.bedrijf.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-semibold text-brand-600 hover:underline">
                Bekijk op Google ↗
              </a>
            )}
          </div>
          <ScoreCirkel score={r.score} oordeel={r.oordeel} />
        </div>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Opbouw van de score">
          {r.onderdelen.map((o) => (
            <li key={o.id} className="rounded-xl border border-hair p-3">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{o.label}</span>
                <span className="num text-neutralx-600">
                  {o.punten}/{o.max}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-hair" aria-hidden>
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.round((o.punten / o.max) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-neutralx-600">{o.uitleg}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-neutralx-500">Gescand op {gescand}. Google laat via zijn koppeling hooguit 5 reviews zien, en niet of je al gereageerd hebt.</p>
      </section>

      {(doel || inhalen) && (
        <section className="card p-5 sm:p-6" aria-labelledby="rs-doel">
          <h2 id="rs-doel" className="font-display text-lg font-bold text-ink">
            Je volgende doel
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-ink">
            {doel && (
              <li>
                Met ongeveer <strong>{doel.nodig}</strong> nieuwe vijfsterrenreviews ga je van {cijfer(doel.van)} naar <strong>{cijfer(doel.naar)}</strong>.
              </li>
            )}
            {inhalen && (
              <li>
                {inhalen.naam} heeft {getal(inhalen.aantal)} reviews. Met zo&apos;n <strong>{inhalen.perMaand}</strong> nieuwe reviews per maand haal je dat in een half jaar in.
              </li>
            )}
          </ul>
        </section>
      )}

      {r.concurrenten.length > 0 && (
        <section className="card p-5 sm:p-6" aria-labelledby="rs-buurt">
          <h2 id="rs-buurt" className="font-display text-lg font-bold text-ink">
            Zo sta je ervoor in de buurt
          </h2>
          {r.positie && (
            <p className="mt-1 text-sm text-neutralx-600">
              Plek {r.positie.plek} van {r.positie.van} vergelijkbare bedrijven binnen 3 km (score en aantal reviews samen).
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="py-2 pr-3 font-medium">Bedrijf</th>
                  <th className="py-2 pr-3 text-right font-medium">Score</th>
                  <th className="py-2 text-right font-medium">Reviews</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                <tr className="font-semibold text-ink">
                  <td className="py-2 pr-3">{r.bedrijf.naam} (jij)</td>
                  <td className="num py-2 pr-3 text-right">{r.rating !== null ? cijfer(r.rating) : "–"}</td>
                  <td className="num py-2 text-right">{getal(r.aantal)}</td>
                </tr>
                {r.concurrenten.map((c) => (
                  <tr key={`${c.naam}-${c.aantal}`} className="text-neutralx-700">
                    <td className="py-2 pr-3">{c.naam}</td>
                    <td className="num py-2 pr-3 text-right">{c.rating !== null ? cijfer(c.rating) : "–"}</td>
                    <td className="num py-2 text-right">{getal(c.aantal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(r.analyse.samenvatting || r.analyse.sterk.length > 0 || r.analyse.verbeter.length > 0) && (
        <section className="card p-5 sm:p-6" aria-labelledby="rs-klanten">
          <h2 id="rs-klanten" className="font-display text-lg font-bold text-ink">
            Wat klanten zeggen
          </h2>
          {r.analyse.samenvatting && <p className="mt-2 text-sm text-ink">{r.analyse.samenvatting}</p>}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {r.analyse.sterk.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink">Dit waarderen ze</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutralx-700">
                  {r.analyse.sterk.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.analyse.verbeter.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink">Dit kan beter</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutralx-700">
                  {r.analyse.verbeter.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {r.voorstellen.length > 0 && (
        <section className="card p-5 sm:p-6" aria-labelledby="rs-voorstellen">
          <h2 id="rs-voorstellen" className="font-display text-lg font-bold text-ink">
            Verbetervoorstellen
          </h2>
          <p className="mt-1 text-sm text-neutralx-600">Op volgorde van wat het meeste oplevert.</p>
          <ul className="mt-4 space-y-3">
            {r.voorstellen.map((v) => (
              <VoorstelKaart key={v.id} v={v} variant={variant} />
            ))}
          </ul>
        </section>
      )}

      {r.reviews.length > 0 && (
        <section id="antwoorden" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="rs-antwoorden">
          <h2 id="rs-antwoorden" className="font-display text-lg font-bold text-ink">
            Antwoordvoorstellen
          </h2>
          <p className="mt-1 text-sm text-neutralx-600">De reviews die Google nu bovenaan toont, met een voorstel voor je antwoord. Pas het gerust aan en plaats het bij de review in je Google-bedrijfsprofiel.</p>
          <ul className="mt-4 space-y-4">
            {r.reviews.map((rv, i) => (
              <li key={`${i}-${rv.geplaatst ?? ""}`} className="rounded-2xl border border-hair bg-white p-4">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Sterren n={rv.rating} />
                  {rv.wanneer && <span className="text-neutralx-500">{rv.wanneer}</span>}
                </p>
                {rv.tekst ? <p className="mt-2 line-clamp-6 break-words text-sm text-neutralx-700">{rv.tekst}</p> : <p className="mt-2 text-sm italic text-neutralx-500">Alleen sterren, geen tekst.</p>}
                {rv.antwoord && <Antwoord tekst={rv.antwoord} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dealId && (
        <div className="flex flex-col gap-4 rounded-2xl bg-ink p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="font-display text-xl font-bold">Je voorstel op maat staat klaar</p>
            <p className="mt-1 text-sm text-white/70">Wat {r.bedrijf.naam} het meeste oplevert, met echte prijzen. Jij vinkt aan wat je wilt.</p>
          </div>
          <Link href={`/deal/${dealId}`} className="btn-mint flex-shrink-0 px-6 py-3">
            Bekijk je voorstel
          </Link>
        </div>
      )}
      {variant === "openbaar" && <Aanvraag scanId={r.id} />}
    </div>
  );
}
