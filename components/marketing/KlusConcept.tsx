"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CONCEPT_KEY, conceptCost, type KlusConcept as Concept } from "@/lib/klusconcept/concept";
import { centsFrom, euroCents, euroWhole, numberFrom } from "@/lib/rekentools/invoer";
import { Groep, Veld, useEersteGebruik } from "@/components/marketing/rekentools/Veld";

export interface ConceptTemplate {
  key: string;
  label: string;
  rateCents: number;
  breakMinutes: number;
  description: string;
}

const ANDERS = "anders";
const PAUZES = [0, 15, 30, 45, 60];

const pad = (n: number) => String(n).padStart(2, "0");
// Shift hours keep their half and quarter hours (7,5 uur), unlike the rounded totals in invoer.ts.
const uurNl = (h: number) => h.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dateNl(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });
}

const field = "w-full rounded-xl border border-hair bg-paper px-4 py-2.5 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500";

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

  function pickTemplate(key: string) {
    setTpl(key);
    const t = templates.find((x) => x.key === key);
    if (t) {
      setDescription(t.description);
      setBreakMinutes(t.breakMinutes);
      setRate((t.rateCents / 100).toFixed(2).replace(".", ","));
    }
  }

  const title = tpl === ANDERS ? eigen.trim() : (templates.find((t) => t.key === tpl)?.label ?? "");
  const rateCents = centsFrom(rate);
  const effectiveRate = Math.max(rateCents, minRateCents);
  const people = Math.max(1, Math.min(50, Math.round(numberFrom(positions)) || 1));
  const cost = useMemo(
    () => conceptCost({ start, end, breakMinutes, positions: people, rateCents: effectiveRate }),
    [start, end, breakMinutes, people, effectiveRate],
  );
  const supply = cities.find((c) => c.name.toLowerCase() === city.trim().toLowerCase())?.supply ?? null;
  const ready = title.length >= 2 && city.trim().length >= 2 && date !== "" && date >= today && cost.hours > 0;

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
    router.push(employer ? "/werkgever/diensten/nieuw" : "/register?type=bedrijf");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="space-y-5" onChange={used}>
        <Groep title="Wat moet er gebeuren?">
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-ink">Functie</span>
            <select value={tpl} onChange={(e) => pickTemplate(e.target.value)} className={`mt-1.5 ${field}`}>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className={`mt-1.5 ${field}`} />
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
        <div className="mt-4 rounded-2xl border border-hair bg-paper-soft p-4">
          <p className="font-display text-lg font-semibold text-ink">{title || "Je klus"}</p>
          <p className="mt-1 text-sm text-neutralx-600">
            {[city.trim() || "Plaats", date ? dateNl(date) : "datum", `${start}–${end}`].join(" · ")}
          </p>
          <p className="mt-2 text-sm text-ink">
            <span className="num font-semibold">{euroCents(effectiveRate)}</span> per uur · {uurNl(cost.hours)} uur ·{" "}
            {people} {people === 1 ? "persoon" : "mensen"}
          </p>
        </div>

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
  );
}
