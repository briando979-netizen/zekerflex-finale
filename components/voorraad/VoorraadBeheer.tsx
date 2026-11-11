"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bestelStand, bestelTekst, bestellijst, eenheidTekst, filterEnSorteer, isBijnaOp, isOp, nlGetal, voorraadWaarde, type Artikel, type VoorraadFilter, type VoorraadSortering } from "@/lib/voorraad/model";
import { ArtikelFormulier } from "@/components/voorraad/ArtikelFormulier";
import { leesFout } from "@/components/voorraad/fout";
import { ArtikelDetail } from "@/components/voorraad/ArtikelDetail";

// Het voorraadbeheer van een bedrijf: overzicht, bijna-op-kaart met bestellijst, snelle +/- knoppen en per artikel het logboek.

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);
const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500 disabled:opacity-40";

export function VoorraadBeheer() {
  const [artikelen, setArtikelen] = useState<Artikel[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState<VoorraadFilter>("alle");
  const [sortering, setSortering] = useState<VoorraadSortering>("naam");
  const [aflopend, setAflopend] = useState(false);
  const [metArchief, setMetArchief] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      const res = await fetch("/api/werkgever/voorraad", { cache: "no-store" });
      if (!res.ok) {
        setFout(await leesFout(res, "De voorraad kon niet worden geladen. Vernieuw de pagina."));
        return;
      }
      const d = (await res.json()) as { artikelen: Artikel[] };
      setArtikelen(d.artikelen);
    } catch {
      setFout("De voorraad kon niet worden geladen. Controleer je verbinding.");
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  /** Na een wijziging nemen we de teruggegeven versie van de server over, niet een lokaal bijgewerkt veld. */
  const vervang = useCallback((a: Artikel) => setArtikelen((lijst) => (lijst ? (lijst.some((x) => x.id === a.id) ? lijst.map((x) => (x.id === a.id ? a : x)) : [...lijst, a]) : [a])), []);
  const verwijder = useCallback((id: string) => setArtikelen((lijst) => (lijst ? lijst.filter((x) => x.id !== id) : lijst)), []);

  const zichtbaar = useMemo(() => (artikelen ? filterEnSorteer(artikelen, { zoek, filter, sortering, aflopend, metGearchiveerd: metArchief }) : []), [artikelen, zoek, filter, sortering, aflopend, metArchief]);
  const waarde = useMemo(() => voorraadWaarde(artikelen ?? []), [artikelen]);
  const groepen = useMemo(() => bestellijst(artikelen ?? []), [artikelen]);
  const aantalBijna = groepen.reduce((n, g) => n + g.regels.length, 0);

  async function snel(a: Artikel, richting: 1 | -1) {
    setFout(null);
    const res = await fetch("/api/werkgever/voorraad", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, actie: "mutatie", reden: richting === 1 ? "inkoop" : "gebruikt", hoeveelheid: 1, opmerking: "Snelle knop" }),
    });
    if (!res.ok) {
      setFout(await leesFout(res, "De wijziging is niet gelukt."));
      return;
    }
    vervang(((await res.json()) as { artikel: Artikel }).artikel);
  }

  async function kopieer(tekst: string, sleutel: string) {
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(sleutel);
      window.setTimeout(() => setGekopieerd(null), 2500);
    } catch {
      setFout("Kopiëren lukt hier niet. Selecteer de tekst hieronder en kopieer hem zelf.");
    }
  }

  if (!artikelen) {
    return fout ? (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">Laden…</p>
    );
  }

  const actief = artikelen.filter((a) => !a.gearchiveerd);

  return (
    <div className="space-y-4">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={kaart}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Artikelen</p>
          <p className="mt-1 text-2xl font-bold text-ink">{actief.length}</p>
        </div>
        <div className={kaart}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Voorraadwaarde</p>
          <p className="mt-1 text-2xl font-bold text-ink">{euro(waarde.totaalCent)}</p>
          {waarde.zonderPrijs > 0 && (
            <p className="mt-1 text-xs text-neutralx-600">
              Niet meegerekend: {waarde.zonderPrijs} {waarde.zonderPrijs === 1 ? "artikel" : "artikelen"} zonder kostprijs.
            </p>
          )}
        </div>
        <div className={kaart}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Bijna op</p>
          <p className="mt-1 text-2xl font-bold text-ink">{aantalBijna}</p>
        </div>
      </div>

      {aantalBijna > 0 && (
        <section aria-labelledby="bijna-kop" className="rounded-xl border border-hair bg-brand-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="bijna-kop" className="font-display text-base font-bold text-ink">
              Bijna op: {aantalBijna} {aantalBijna === 1 ? "artikel" : "artikelen"}
            </h2>
            <button type="button" className={knopKlein} onClick={() => void kopieer(bestelTekst(groepen), "alles")}>
              {gekopieerd === "alles" ? "Gekopieerd" : "Kopieer bestellijst"}
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {groepen.map((g) => (
              <div key={g.leverancier}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{g.leverancier}</p>
                  <button type="button" className={knopKlein} onClick={() => void kopieer(bestelTekst([g]), g.leverancier)}>
                    {gekopieerd === g.leverancier ? "Gekopieerd" : "Kopieer"}
                  </button>
                </div>
                <ul className="mt-1 space-y-0.5 text-sm text-neutralx-600">
                  {g.regels.map(({ artikel: a, tekort }) => (
                    <li key={a.id}>
                      {a.naam}: {bestelStand(a, tekort)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="vr-zoek" className="field-label">
            Zoeken
          </label>
          <input id="vr-zoek" className="field-input" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam, artikelnummer of leverancier" />
        </div>
        <div>
          <label htmlFor="vr-filter" className="field-label">
            Tonen
          </label>
          <select id="vr-filter" className="field-input" value={filter} onChange={(e) => setFilter(e.target.value as VoorraadFilter)}>
            <option value="alle">Alles</option>
            <option value="bijna">Bijna op</option>
            <option value="op">Op</option>
          </select>
        </div>
        <div>
          <label htmlFor="vr-sort" className="field-label">
            Sorteren op
          </label>
          <select id="vr-sort" className="field-input" value={sortering} onChange={(e) => setSortering(e.target.value as VoorraadSortering)}>
            <option value="naam">Naam</option>
            <option value="aantal">Aantal</option>
            <option value="waarde">Waarde</option>
          </select>
        </div>
        <button type="button" className={knopKlein} aria-pressed={aflopend} onClick={() => setAflopend((v) => !v)}>
          {aflopend ? "Aflopend" : "Oplopend"}
        </button>
        <button type="button" className="btn-primary" onClick={() => setNieuw((v) => !v)}>
          {nieuw ? "Sluiten" : "Artikel toevoegen"}
        </button>
        <a className={knopKlein} href="/api/werkgever/voorraad/export" download>
          Download voor Excel
        </a>
      </div>
      <label className="flex items-center gap-2 text-sm text-neutralx-600">
        <input type="checkbox" checked={metArchief} onChange={(e) => setMetArchief(e.target.checked)} />
        Ook gearchiveerde artikelen tonen
      </label>

      {nieuw && (
        <div className={kaart}>
          <h2 className="mb-3 font-display text-base font-bold text-ink">Nieuw artikel</h2>
          <ArtikelFormulier
            opgeslagen={(a) => {
              vervang(a);
              setNieuw(false);
            }}
            annuleer={() => setNieuw(false)}
          />
        </div>
      )}

      {zichtbaar.length === 0 ? (
        <p className="rounded-xl border border-hair bg-white px-4 py-6 text-center text-sm text-neutralx-600">
          {artikelen.length === 0 ? "Je hebt nog geen artikelen. Voeg je eerste artikel toe." : "Geen artikelen gevonden met deze zoekopdracht of dit filter."}
        </p>
      ) : (
        <ul className="space-y-2">
          {zichtbaar.map((a) => (
            <li key={a.id} className={kaart}>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <span className="block truncate font-semibold text-ink">
                    {a.naam}
                    {a.gearchiveerd && <span className="ml-2 rounded bg-paper-soft px-1.5 py-0.5 text-xs font-normal text-neutralx-600">Gearchiveerd</span>}
                  </span>
                  <span className="block truncate text-xs text-neutralx-500">
                    {[a.sku, a.leverancier, a.locatie].filter(Boolean).join(" · ") || "Geen extra gegevens"}
                    {a.kostprijsCent !== null ? ` · ${euro(a.kostprijsCent)} per ${a.eenheid}` : ""}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={`Een ${a.eenheid} eraf bij ${a.naam}`} className={knopKlein} disabled={a.gearchiveerd || a.aantal < 1} onClick={() => void snel(a, -1)}>
                    −
                  </button>
                  <span className="min-w-16 text-center">
                    <span className="block text-lg font-bold text-ink">{nlGetal(a.aantal)}</span>
                    <span className="block text-xs text-neutralx-500">{eenheidTekst(a.eenheid, a.aantal)}</span>
                  </span>
                  <button type="button" aria-label={`Een ${a.eenheid} erbij bij ${a.naam}`} className={knopKlein} disabled={a.gearchiveerd} onClick={() => void snel(a, 1)}>
                    +
                  </button>
                </div>
                {isOp(a) ? <span className="pill-crit">Op</span> : isBijnaOp(a) ? <span className="pill-warn">Bijna op</span> : null}
              </div>
              {open === a.id && <ArtikelDetail artikel={a} vervang={vervang} verwijder={verwijder} sluit={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
