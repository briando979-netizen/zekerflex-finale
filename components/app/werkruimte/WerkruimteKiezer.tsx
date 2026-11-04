"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { WERKRUIMTES, WERKRUIMTE_INFO, type Werkruimte } from "@/lib/werkgever/werkruimte";

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
        throw new Error(body?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
      }
      setOpen(false);
      setKlaar(`Opgeslagen: je menu en startscherm zijn nu ingericht voor ${WERKRUIMTE_INFO[soort].naam.toLowerCase()}.`);
      router.refresh();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  };

  if (!open) {
    return (
      <section aria-label="Werkruimte" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hair bg-white px-4 py-3 text-sm text-neutralx-600">
        <p>
          Je werkruimte is ingericht voor <strong className="text-ink">{WERKRUIMTE_INFO[huidig].naam.toLowerCase()}</strong>
          {huidig !== "personeel" && ookPersoneel ? " en personeel inhuren" : ""}.
          {klaar ? (
            <span role="status" className="ml-1 text-ok">
              {klaar}
            </span>
          ) : null}
        </p>
        {kanKiezen ? (
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-brand-600 hover:underline">
            Wijzigen
          </button>
        ) : (
          <span className="text-xs text-neutralx-500">De beheerder van je bedrijf kan dit wijzigen.</span>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-kop`} className={`${alsVraag ? "mb-8" : "mt-8"} rounded-2xl border border-brand-500/30 bg-white p-5`}>
      <h2 id={`${id}-kop`} className="font-display text-lg font-bold text-ink">
        {alsVraag ? "Waar gebruik je ZekerFlex voor?" : "Wat voor bedrijf ben je?"}
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">
        Je menu en startscherm passen zich aan. Alle functies blijven bereikbaar en je kunt dit altijd wijzigen.
      </p>
      <fieldset className="mt-4">
        <legend className="sr-only">Soort bedrijf</legend>
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
                <span className="block font-semibold text-ink">{WERKRUIMTE_INFO[w].naam}</span>
                <span className="block text-sm text-neutralx-600">{WERKRUIMTE_INFO[w].uitleg}</span>
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
            <span>Ik huur ook personeel in via ZekerFlex (klussen, inplannen, uren en facturen in het menu)</span>
          </label>
          {personeelVast && (
            <p id={`${id}-vast`} className="ml-6 mt-1 text-xs text-neutralx-500">
              Staat aan omdat je al personeel via ZekerFlex inhuurt.
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
          {bezig ? "Bezig…" : alsVraag ? "Zo inrichten" : "Opslaan"}
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
            Annuleren
          </button>
        )}
      </div>
    </section>
  );
}
