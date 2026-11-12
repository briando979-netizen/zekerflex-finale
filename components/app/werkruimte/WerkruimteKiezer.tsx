"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { WERKRUIMTES, type Werkruimte } from "@/lib/werkgever/werkruimte";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// "Wat voor bedrijf ben je?" — richt het menu en het startscherm van /werkgever in
// (POST /api/werkgever/werkruimte). Dicht een regel met "Wijzigen"; open (of als
// eerste vraag voor een nieuw bedrijf) vier keuzes plus "ook personeel inhuren".

export function WerkruimteKiezer({
  huidig,
  ookPersoneel,
  personeelVast,
  kanKiezen,
  alsVraag = false,
}: {
  huidig: Werkruimte;
  ookPersoneel: boolean;
  /** al klussen of de horeca-module personeel: de personeelsfuncties blijven sowieso */
  personeelVast: boolean;
  /** alleen de beheerder van het bedrijf kiest */
  kanKiezen: boolean;
  /** nieuw bedrijf: meteen open, als eerste vraag bovenaan */
  alsVraag?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const dict = useT();
  const k = dict.werkruimteKiezer;
  const info = (w: Werkruimte) => ({ naam: dict.werkruimteInfo[`${w}Naam` as const], uitleg: dict.werkruimteInfo[`${w}Uitleg` as const] });
  const [open, setOpen] = useState(alsVraag);
  const [soort, setSoort] = useState<Werkruimte>(huidig);
  const [personeel, setPersoneel] = useState(ookPersoneel);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);

  const bewaar = async () => {
    setBezig(true);
    setFout(null);
    setKlaar(null);
    try {
      const res = await fetch("/api/werkgever/werkruimte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soort, ookPersoneel: soort === "personeel" || personeel || personeelVast }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? k.opslaanMislukt);
      }
      const antwoord = (await res.json().catch(() => null)) as { ga?: string } | null;
      setOpen(false);
      setKlaar(fmt(k.opgeslagen, { soort: info(soort).naam.toLowerCase() }));
      // elk dashboard heeft een eigen omgeving (lib/werkgever/werkruimte.ts thuisVan); volledig laden voor het nieuwe menu
      if (antwoord?.ga) window.location.assign(antwoord.ga);
      else router.refresh();
    } catch (e) {
      setFout(e instanceof Error ? e.message : k.opslaanMislukt);
    } finally {
      setBezig(false);
    }
  };

  if (!open) {
    return (
      <section aria-label={k.label} className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hair bg-white px-4 py-3 text-sm text-neutralx-600">
        <p>
          {k.ingericht}
          <strong className="text-ink">{info(huidig).naam.toLowerCase()}</strong>
          {huidig !== "personeel" && ookPersoneel ? k.enPersoneel : ""}.
          {klaar ? (
            <span role="status" className="ml-1 text-ok">
              {klaar}
            </span>
          ) : null}
        </p>
        {kanKiezen ? (
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-brand-600 hover:underline">
            {k.wijzigen}
          </button>
        ) : (
          <span className="text-xs text-neutralx-500">{k.alleenBeheerder}</span>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-kop`} className={`${alsVraag ? "mb-8" : "mt-8"} rounded-2xl border border-brand-500/30 bg-white p-5`}>
      <h2 id={`${id}-kop`} className="font-display text-lg font-bold text-ink">
        {alsVraag ? k.kopVraag : k.kop}
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">
        {k.intro}
      </p>
      <fieldset className="mt-4">
        <legend className="sr-only">{k.legend}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WERKRUIMTES.map((w) => (
            <label
              key={w}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${
                soort === w ? "border-brand-500 bg-brand-50" : "border-hair hover:border-brand-500"
              }`}
            >
              <input type="radio" name={`${id}-soort`} value={w} checked={soort === w} onChange={() => setSoort(w)} className="mt-1 accent-brand-600" />
              <span>
                <span className="block font-semibold text-ink">{info(w).naam}</span>
                <span className="block text-sm text-neutralx-600">{info(w).uitleg}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {soort !== "personeel" && (
        <div className="mt-4 text-sm">
          <label className="flex items-start gap-2.5 text-neutralx-700">
            <input
              type="checkbox"
              checked={personeel || personeelVast}
              disabled={personeelVast}
              onChange={(e) => setPersoneel(e.target.checked)}
              aria-describedby={personeelVast ? `${id}-vast` : undefined}
              className="mt-0.5 accent-brand-600"
            />
            <span>{k.personeel}</span>
          </label>
          {personeelVast && (
            <p id={`${id}-vast`} className="ml-6 mt-1 text-xs text-neutralx-500">
              {k.vast}
            </p>
          )}
        </div>
      )}
      {fout && (
        <p role="alert" className="mt-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={bewaar} disabled={bezig} className="btn-primary">
          {bezig ? k.bezig : alsVraag ? k.zoInrichten : k.opslaan}
        </button>
        {!alsVraag && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setSoort(huidig);
              setPersoneel(ookPersoneel);
              setFout(null);
            }}
            className="btn-ghost"
          >
            {k.annuleren}
          </button>
        )}
      </div>
    </section>
  );
}
