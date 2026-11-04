"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CONCEPT_KEY, conceptCost, type KlusConcept as Concept } from "@/lib/klusconcept/concept";
import { initialen, websiteOmschrijving, type WebsiteKlus } from "@/lib/klusconcept/website";
import { centsFrom, euroCents, euroWhole, numberFrom } from "@/lib/rekentools/invoer";
import { tekstOp } from "@/lib/rijschool/kleuren";
import { Groep, Veld, useEersteGebruik } from "@/components/marketing/rekentools/Veld";
import { KlusKaart } from "@/components/marketing/KlusKaart";
import { KlusSimulatie } from "@/components/marketing/KlusSimulatie";
import { SjabloonGalerij } from "@/components/app/SjabloonGalerij";
import { SHIFT_CATEGORIES, shiftCategory, type ShiftCategoryKey } from "@/lib/shifts/category";

export interface ConceptTemplate {
  key: string;
  label: string;
  rateCents: number;
  breakMinutes: number;
  description: string;
  branche?: ShiftCategoryKey | undefined;
}

const ANDERS = "anders";
const PAUZES = [0, 15, 30, 45, 60];
const BRAND = "#0E5C4A";

const pad = (n: number) => String(n).padStart(2, "0");
// Shift hours keep their half and quarter hours (7,5 uur), unlike the rounded totals in invoer.ts.
const uurNl = (h: number) => h.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dateNl(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("nl-NL", { ...opts, timeZone: "Europe/Amsterdam" });
}

const field = "w-full rounded-xl border border-hair bg-paper px-4 py-2.5 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500";

/** What we took over from the company's website, so the visitor can check it. */
function WebsiteGevonden({ w, functie, onOpnieuw }: { w: WebsiteKlus; functie: string | null; onOpnieuw: () => void }) {
  const bg = w.kleur ?? BRAND;
  const ingevuld = [
    functie ? `functie: ${functie}` : null,
    w.plaats ? `plaats: ${w.plaats}` : null,
    w.bedrijf || w.over ? "een omschrijving over je bedrijf" : null,
  ].filter(Boolean);
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-mintwash p-4 sm:flex-row sm:items-center">
      {w.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={w.logo} alt={`Logo van ${w.bedrijf ?? w.host}`} className="h-12 w-12 flex-shrink-0 rounded-xl border border-hair bg-white object-contain p-1" />
      ) : (
        <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl font-bold" style={{ background: bg, color: tekstOp(bg) }} aria-hidden="true">
          {initialen(w.bedrijf ?? w.host)}
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">
          {w.bedrijf ?? w.host} <span className="font-normal text-neutralx-600">· {w.host}</span>
        </p>
        <p className="mt-0.5 text-brand-700">
          {ingevuld.length ? `We vulden in: ${ingevuld.join(", ")}.` : "We vonden je website, maar konden er weinig uit halen."}
          {functie ? "" : " Welke functie past, kies je hieronder zelf."} Klopt iets niet? Pas het hieronder aan.
        </p>
      </div>
      <button type="button" onClick={onOpnieuw} className="btn-ghost flex-shrink-0 text-sm">
        Andere website
      </button>
    </div>
  );
}

export function KlusConcept({
  templates,
  minRateCents,
  cities,
  initial = {},
}: {
  templates: ConceptTemplate[];
  minRateCents: number;
  cities: { name: string; supply: string | null }[];
  /** from a sector/city page link (lib/klusconcept/concept.ts klusUrl) */
  initial?: { templateKey?: string; city?: string };
}) {
  const router = useRouter();
  const used = useEersteGebruik("klus-concept");
  const first = templates.find((t) => t.key === initial.templateKey) ?? templates[0];
  const [tpl, setTpl] = useState(first?.key ?? ANDERS);
  const [eigen, setEigen] = useState("");
  const [description, setDescription] = useState(first?.description ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState(first?.breakMinutes ?? 30);
  const [positions, setPositions] = useState("1");
  const [rate, setRate] = useState(((first?.rateCents ?? minRateCents) / 100).toFixed(2).replace(".", ","));
  const [saving, setSaving] = useState(false);
  const [employer, setEmployer] = useState(false);
  // the company's own website, read by /api/klus-plaatsen/website
  const [site, setSite] = useState("");
  const [reading, setReading] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [found, setFound] = useState<WebsiteKlus | null>(null);
  // the function list grouped per branch, in the order of the branch filter
  const groepen = useMemo(
    () =>
      SHIFT_CATEGORIES.map((c) => ({ key: c.key, label: c.label, items: templates.filter((t) => (t.branche ?? shiftCategory(t.label, null).key) === c.key) })).filter(
        (g) => g.items.length > 0,
      ),
    [templates],
  );

  // Dates in the browser's own (Dutch) time: the server runs in UTC.
  useEffect(() => {
    const now = new Date();
    setToday(localDay(now));
    setDate(localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)));
  }, []);

  // Already signed in as a werkgever: skip sign-up and go straight to Nieuwe dienst.
  useEffect(() => {
    fetch("/api/auth/werkgever", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { werkgever?: boolean } | null) => setEmployer(me?.werkgever === true))
      .catch(() => undefined);
  }, []);

  function pickTemplate(key: string, w: WebsiteKlus | null = found) {
    setTpl(key);
    const t = templates.find((x) => x.key === key);
    if (t) {
      setDescription(w ? websiteOmschrijving(t.description, w) : t.description);
      setBreakMinutes(t.breakMinutes);
      setRate((t.rateCents / 100).toFixed(2).replace(".", ","));
    }
  }

  async function readSite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reading || site.trim().length < 3) return;
    used();
    setReading(true);
    setSiteError(null);
    try {
      const res = await fetch("/api/klus-plaatsen/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: site.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { result?: WebsiteKlus; error?: { message?: string } } | null;
      const w = body?.result;
      if (!res.ok || !w) {
        setSiteError(body?.error?.message ?? "We konden je website nu niet lezen. Vul je klus hieronder zelf in.");
        return;
      }
      setFound(w);
      const key = w.templateKey && templates.some((t) => t.key === w.templateKey) ? w.templateKey : tpl;
      if (key === ANDERS) setDescription((d) => websiteOmschrijving(d.split("\n\nOver ")[0] ?? d, w));
      else pickTemplate(key, w);
      if (w.plaats) setCity(cities.find((c) => c.name.toLowerCase() === w.plaats!.toLowerCase())?.name ?? w.plaats);
    } catch {
      setSiteError("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setReading(false);
    }
  }

  function forgetSite() {
    setFound(null);
    setSite("");
    setSiteError(null);
    const t = templates.find((x) => x.key === tpl);
    if (t) setDescription(t.description);
  }

  const title = tpl === ANDERS ? eigen.trim() : (templates.find((t) => t.key === tpl)?.label ?? "");
  const rateCents = centsFrom(rate);
  const effectiveRate = Math.max(rateCents, minRateCents);
  const people = Math.max(1, Math.min(50, Math.round(numberFrom(positions)) || 1));
  const cost = useMemo(
    () => conceptCost({ start, end, breakMinutes, positions: people, rateCents: effectiveRate }),
    [start, end, breakMinutes, people, effectiveRate],
  );
  const costOne = useMemo(
    () => conceptCost({ start, end, breakMinutes, positions: 1, rateCents: effectiveRate }),
    [start, end, breakMinutes, effectiveRate],
  );
  const supply = cities.find((c) => c.name.toLowerCase() === city.trim().toLowerCase())?.supply ?? null;
  const ready = title.length >= 2 && city.trim().length >= 2 && date !== "" && date >= today && cost.hours > 0;
  const bedrijf = found?.bedrijf ?? "Jouw bedrijf";
  const when = `${date ? dateNl(date, { weekday: "short", day: "numeric", month: "short" }) : "Datum"} · ${start}–${end}`;
  const kaart = { title: title || "Je klus", bedrijf, city: city.trim() || "Plaats", when, start, rateCents: effectiveRate, hours: cost.hours };

  function save() {
    if (!ready) return;
    setSaving(true);
    const concept: Concept = {
      v: 1,
      title,
      description: description.trim(),
      city: city.trim(),
      date,
      start,
      end,
      breakMinutes,
      positions: people,
      rateCents: effectiveRate,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(CONCEPT_KEY, JSON.stringify(concept));
    } catch {
      /* private mode: sign-up still works, the form just starts empty */
    }
    const company = found?.bedrijf ? `&company=${encodeURIComponent(found.bedrijf)}` : "";
    router.push(employer ? "/werkgever/diensten/nieuw" : `/register?type=bedrijf${company}`);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={readSite} className="rounded-3xl border border-hair bg-white p-5 shadow-sm md:p-6" noValidate>
        <label className="block" htmlFor="klus-site">
          <span className="block font-display text-lg font-semibold text-ink">Heb je een website? Dan maken we je klus op maat.</span>
          <span className="mt-1 block text-sm text-neutralx-600">
            We lezen de voorpagina en vullen je bedrijfsnaam, de plaats en een passende functie alvast in.
          </span>
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="klus-site"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={site}
            onChange={(e) => setSite(e.target.value)}
            maxLength={500}
            placeholder="jouwbedrijf.nl"
            aria-invalid={siteError ? true : undefined}
            aria-describedby={siteError ? "klus-site-fout" : undefined}
            className={field}
          />
          <button type="submit" disabled={reading || site.trim().length < 3} className="btn-primary flex-shrink-0 disabled:opacity-50">
            {reading ? "We lezen je website…" : "Lees mijn website"}
          </button>
        </div>
        {siteError ? (
          <p id="klus-site-fout" role="alert" className="mt-3 text-sm font-medium text-crit">
            {siteError}
          </p>
        ) : null}
        {found ? (
          <WebsiteGevonden w={found} functie={templates.find((t) => t.key === found.templateKey)?.label ?? null} onOpnieuw={forgetSite} />
        ) : (
          <p className="mt-3 text-xs text-neutralx-500">Geen website? Vul je klus hieronder gewoon zelf in.</p>
        )}
      </form>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-5" onChange={used}>
          <Groep title="Wat moet er gebeuren?">
            <div className="min-w-0 sm:col-span-2">
              <SjabloonGalerij
                sjablonen={templates.map((t) => ({ key: t.key, label: t.label, rateCents: t.rateCents, branche: t.branche }))}
                gekozen={tpl === ANDERS ? "" : tpl}
                onKies={(key) => pickTemplate(key)}
                kop="Kies een functie"
              />
            </div>
            <label className="block sm:col-span-2">
              <span className="block text-sm font-medium text-ink">Functie</span>
              <select value={tpl} onChange={(e) => pickTemplate(e.target.value)} className={`mt-1.5 ${field}`}>
                {groepen.map((g) => (
                  <optgroup key={g.key} label={g.label}>
                    {g.items.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={ANDERS}>Iets anders…</option>
              </select>
            </label>
            {tpl === ANDERS ? (
              <label className="block sm:col-span-2">
                <span className="block text-sm font-medium text-ink">Naam van de klus</span>
                <input value={eigen} onChange={(e) => setEigen(e.target.value)} maxLength={120} placeholder="Bijv. Opbouw beursstand" className={`mt-1.5 ${field}`} />
              </label>
            ) : null}
            <label className="block sm:col-span-2">
              <span className="block text-sm font-medium text-ink">Omschrijving</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={found ? 5 : 3} maxLength={2000} className={`mt-1.5 ${field}`} />
            </label>
          </Groep>

          <Groep title="Waar en wanneer?">
            <label className="block">
              <span className="block text-sm font-medium text-ink">Plaats</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} list="klus-steden" maxLength={80} autoComplete="address-level2" placeholder="Bijv. Utrecht" className={`mt-1.5 ${field}`} />
              <datalist id="klus-steden">
                {cities.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink">Datum</span>
              <input type="date" value={date} min={today || undefined} onChange={(e) => setDate(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink">Van</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink">Tot</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink">Pauze</span>
              <select value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} className={`mt-1.5 ${field}`}>
                {PAUZES.map((p) => (
                  <option key={p} value={p}>
                    {p === 0 ? "Geen pauze" : `${p} minuten`}
                  </option>
                ))}
              </select>
            </label>
          </Groep>

          <Groep title="Hoeveel en voor welk tarief?">
            <Veld id="klus-positions" label="Aantal mensen" value={positions} onChange={setPositions} />
            <Veld
              id="klus-rate"
              label="Uurtarief van de kracht"
              value={rate}
              onChange={setRate}
              prefix="€"
              hint={rateCents < minRateCents ? `Het minimum is ${euroCents(minRateCents)}; daarmee rekenen we.` : "Een hoger tarief vult je klus sneller."}
            />
          </Groep>
        </div>

        <div className="rounded-3xl border border-hair bg-white p-6 shadow-sm md:p-8 lg:sticky lg:top-24" aria-live="polite">
          <p className="eyebrow">Zo ziet je klus eruit</p>
          <p className="mt-1 text-xs text-neutralx-500">Zo zien krachten hem in de ZekerFlex-app.</p>
          <div className="mx-auto mt-4 max-w-sm">
            <KlusKaart title={kaart.title} bedrijf={bedrijf} city={kaart.city} when={when} rateCents={effectiveRate} hours={cost.hours} />
          </div>
          <p className="mt-3 text-center text-xs text-neutralx-600">
            {people} {people === 1 ? "persoon" : "mensen"} · {uurNl(cost.hours)} uur per persoon
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-neutralx-600">Loon kracht{people > 1 ? "en" : ""}</dt>
            <dd className="num text-right font-semibold text-ink">{euroCents(cost.grossTotalCents)}</dd>
            <dt className="text-neutralx-600">Platformkosten ({uurNl(cost.totalHours)} uur)</dt>
            <dd className="num text-right font-semibold text-ink">{euroCents(cost.feeTotalCents)}</dd>
            <dt className="border-t border-hair pt-2 font-semibold text-ink">Totaal excl. btw</dt>
            <dd className="num border-t border-hair pt-2 text-right font-display text-xl font-bold text-ink">{euroWhole(cost.totalCents)}</dd>
          </dl>

          {supply ? (
            <p className="mt-5 rounded-2xl bg-mintwash p-4 text-sm text-brand-700">
              <strong>{supply}</strong> krachten met een ZekerFlex-profiel wonen binnen 25 km van {city.trim()}.
            </p>
          ) : null}

          <button type="button" onClick={save} disabled={!ready || saving} className="btn-primary mt-6 w-full disabled:opacity-50">
            {saving ? "Even geduld…" : employer ? "Zet deze klus klaar in je account" : "Plaats deze klus met een gratis account"}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-neutralx-500">
            {!ready
              ? "Vul de functie, de plaats en een datum vanaf vandaag in."
              : employer
                ? "Je komt meteen bij Nieuwe dienst, met deze klus al ingevuld. Kies daar je vestiging."
                : "Je klus wacht in deze browser. Na het aanmelden staat hij klaar bij Diensten → Nieuwe dienst. Je betaalt pas als er gewerkt is."}
          </p>
        </div>
      </div>

      <KlusSimulatie
        klus={kaart}
        supply={supply}
        logo={found?.logo ?? null}
        kleur={found?.kleur ?? null}
        kosten={{ loonCents: costOne.grossTotalCents, feeCents: costOne.feeTotalCents, totaalCents: costOne.totalCents }}
      />
    </div>
  );
}
