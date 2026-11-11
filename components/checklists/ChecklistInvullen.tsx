"use client";

import { useEffect, useRef, useState } from "react";
import { aantalMet } from "@/lib/tekst/aantal";

// Het invulformulier van een checklist: per taak "gedaan" of "niet gedaan" (met een opmerking), je naam en een notitie.
// Het wordt gebruikt op de openbare invulpagina (/checklist/<sleutel>, op een telefoon, vaak met een trage verbinding)
// en in het beheer (zelf invullen of een uitvoering corrigeren). De antwoorden blijven op het toestel bewaard tot het
// insturen lukt, en een nieuwe poging gebruikt dezelfde aanvraag-id: de server maakt er nooit twee van.
// De server controleert alles opnieuw; dit scherm is alleen de ingang.

export interface InvulTaak {
  id: string;
  tekst: string;
  opmerkingVerplicht: boolean;
}

interface Antwoord {
  gedaan: boolean | null;
  opmerking: string;
}

export interface KlaarUitkomst {
  dubbel?: boolean;
  compleet: boolean;
  tijdstip: string;
  aantalTaken: number;
  aantalGedaan: number;
}

const klok = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const NAAM_SLEUTEL = "zf-checklist-naam";

function lees<T>(sleutel: string): T | null {
  try {
    const s = window.localStorage.getItem(sleutel);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function schrijf(sleutel: string, waarde: unknown | null) {
  try {
    if (waarde === null) window.localStorage.removeItem(sleutel);
    else window.localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    // zonder opslag werkt het formulier gewoon, alleen zonder bewaren
  }
}
const nieuweAanvraag = (): string => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

const knop = "min-h-12 flex-1 rounded-xl border px-4 py-3 text-base font-semibold";

export function ChecklistInvullen({
  eindpunt,
  taken,
  extra,
  botveld = false,
  opslagSleutel,
  begin,
  onKlaar,
}: {
  eindpunt: string;
  taken: InvulTaak[];
  /** extra velden voor de body (sjabloon-id, verwijzing bij een correctie) */
  extra?: Record<string, unknown>;
  /** een verborgen veld dat bots invullen (alleen op de openbare pagina) */
  botveld?: boolean;
  /** bewaar de antwoorden op dit toestel onder deze naam */
  opslagSleutel?: string;
  begin?: { naam?: string; antwoorden?: Record<string, boolean> };
  /** in het beheer: wat er na het insturen gebeurt (anders toont dit scherm zelf een bedankje) */
  onKlaar?: (u: KlaarUitkomst) => void;
}) {
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [notitie, setNotitie] = useState("");
  const [antw, setAntw] = useState<Record<string, Antwoord>>(() => Object.fromEntries(taken.map((t) => [t.id, { gedaan: begin?.antwoorden?.[t.id] ?? null, opmerking: "" }])));
  const [website, setWebsite] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<KlaarUitkomst | null>(null);
  const aanvraag = useRef("");
  const geladen = useRef(false);

  // bewaarde antwoorden en naam terugzetten (nooit op de server: pas na het laden in de browser)
  useEffect(() => {
    const vorigeNaam = lees<string>(NAAM_SLEUTEL);
    const concept = opslagSleutel ? lees<{ naam?: string; notitie?: string; antw?: Record<string, Antwoord> }>(`zf-checklist:${opslagSleutel}`) : null;
    if (!begin?.naam && (concept?.naam || vorigeNaam)) setNaam(concept?.naam || vorigeNaam || "");
    if (concept?.notitie) setNotitie(concept.notitie);
    const bewaard = concept?.antw;
    if (bewaard) setAntw((huidig) => Object.fromEntries(taken.map((t) => [t.id, bewaard[t.id] ?? huidig[t.id] ?? { gedaan: null, opmerking: "" }])));
    geladen.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het openen
  }, []);

  useEffect(() => {
    if (!geladen.current || !opslagSleutel || klaar) return;
    schrijf(`zf-checklist:${opslagSleutel}`, { naam, notitie, antw });
  }, [naam, notitie, antw, opslagSleutel, klaar]);

  const beantwoord = taken.filter((t) => antw[t.id]?.gedaan !== null && antw[t.id] !== undefined).length;

  function zet(id: string, patch: Partial<Antwoord>) {
    setAntw((a) => ({ ...a, [id]: { gedaan: null, opmerking: "", ...a[id], ...patch } }));
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setFout(null);
    if (naam.trim().length < 2) {
      setFout("Vul je naam in, zodat te zien is wie de checklist deed.");
      return;
    }
    const open = taken.filter((t) => antw[t.id]?.gedaan === null || antw[t.id] === undefined);
    if (open.length > 0) {
      setFout(`Beantwoord elke taak met gedaan of niet gedaan. Nog ${open.length} te gaan, bijvoorbeeld "${open[0]?.tekst ?? ""}".`);
      return;
    }
    const zonder = taken.find((t) => antw[t.id]?.gedaan === false && t.opmerkingVerplicht && !antw[t.id]?.opmerking.trim());
    if (zonder) {
      setFout(`Vul een opmerking in bij "${zonder.tekst}": waarom is dit niet gedaan?`);
      return;
    }
    setBezig(true);
    if (!aanvraag.current) aanvraag.current = nieuweAanvraag();
    try {
      const res = await fetch(eindpunt, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extra,
          uitvoerder: naam,
          notitie,
          aanvraagId: aanvraag.current,
          website,
          taken: taken.map((t) => ({ id: t.id, gedaan: antw[t.id]?.gedaan === true, opmerking: antw[t.id]?.opmerking ?? "" })),
        }),
      });
      const d = (await res.json().catch(() => null)) as { uitvoering?: Partial<KlaarUitkomst> & { opgeslagen?: boolean }; error?: { message?: string } } | null;
      if (!res.ok || !d?.uitvoering) {
        setFout(d?.error?.message ?? "Insturen lukte niet. Je antwoorden staan nog hier; probeer het zo opnieuw.");
        return;
      }
      const u: KlaarUitkomst = {
        compleet: d.uitvoering.compleet ?? taken.every((t) => antw[t.id]?.gedaan === true),
        tijdstip: d.uitvoering.tijdstip ?? new Date().toISOString(),
        aantalTaken: d.uitvoering.aantalTaken ?? taken.length,
        aantalGedaan: d.uitvoering.aantalGedaan ?? taken.filter((t) => antw[t.id]?.gedaan === true).length,
        ...(d.uitvoering.dubbel ? { dubbel: true } : {}),
      };
      schrijf(NAAM_SLEUTEL, naam.trim());
      if (opslagSleutel) schrijf(`zf-checklist:${opslagSleutel}`, null);
      aanvraag.current = "";
      if (onKlaar) onKlaar(u);
      else setKlaar(u);
    } catch {
      setFout("Geen verbinding. Je antwoorden staan nog hier; probeer het opnieuw zodra je weer bereik hebt.");
    } finally {
      setBezig(false);
    }
  }

  function opnieuw() {
    setKlaar(null);
    setNotitie("");
    setAntw(Object.fromEntries(taken.map((t) => [t.id, { gedaan: null, opmerking: "" }])));
    setFout(null);
  }

  if (klaar) {
    return (
      <div role="status" className="rounded-2xl border border-hair bg-white p-5 text-center">
        <p className="text-4xl" aria-hidden="true">
          {klaar.compleet ? "✓" : "!"}
        </p>
        <h2 className="mt-2 font-display text-xl font-bold text-ink">{klaar.compleet ? "Alles gedaan, bedankt!" : "Ingestuurd, bedankt"}</h2>
        <p className="mt-1 text-sm text-neutralx-600">
          {klaar.dubbel ? "Deze checklist was al ingestuurd; er is niets dubbel opgeslagen. " : ""}
          {klaar.aantalGedaan} van {aantalMet(klaar.aantalTaken, "taak", "taken")} gedaan, genoteerd om {klok(klaar.tijdstip)} uur.
          {klaar.compleet ? "" : " De taken die niet gedaan zijn, ziet je werkgever met jouw opmerking."}
        </p>
        <button type="button" onClick={opnieuw} className="mt-4 min-h-12 rounded-xl border border-hairstrong px-5 py-3 text-base font-semibold text-ink">
          Nog een keer invullen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void verstuur(e)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="cl-naam" className="field-label">
          Je naam
        </label>
        <input id="cl-naam" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} autoComplete="name" className="field-input mt-1 min-h-12 text-base" />
      </div>

      <p className="text-sm text-neutralx-600" aria-live="polite">
        {beantwoord} van {aantalMet(taken.length, "taak", "taken")} beantwoord
      </p>

      <ul className="space-y-3">
        {taken.map((t, n) => {
          const a = antw[t.id] ?? { gedaan: null, opmerking: "" };
          return (
            <li key={t.id}>
              <fieldset className="rounded-2xl border border-hair bg-white p-3">
                <legend className="px-1 text-base font-semibold text-ink">
                  {n + 1}. {t.tekst}
                </legend>
                <div className="mt-1 flex gap-2">
                  <button type="button" aria-pressed={a.gedaan === true} onClick={() => zet(t.id, { gedaan: true })} className={`${knop} ${a.gedaan === true ? "border-ok bg-ok/10 text-ok" : "border-hairstrong bg-white text-ink"}`}>
                    Gedaan
                  </button>
                  <button type="button" aria-pressed={a.gedaan === false} onClick={() => zet(t.id, { gedaan: false })} className={`${knop} ${a.gedaan === false ? "border-crit bg-crit/10 text-crit" : "border-hairstrong bg-white text-ink"}`}>
                    Niet gedaan
                  </button>
                </div>
                {a.gedaan === false && (
                  <div className="mt-2">
                    <label htmlFor={`cl-op-${t.id}`} className="field-label">
                      {t.opmerkingVerplicht ? "Waarom niet? (verplicht)" : "Waarom niet? (mag leeg)"}
                    </label>
                    <textarea id={`cl-op-${t.id}`} value={a.opmerking} onChange={(e) => zet(t.id, { opmerking: e.target.value })} maxLength={200} rows={2} className="field-input mt-1 text-base" />
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>

      <div>
        <label htmlFor="cl-notitie" className="field-label">
          Notitie (mag leeg)
        </label>
        <textarea id="cl-notitie" value={notitie} onChange={(e) => setNotitie(e.target.value)} maxLength={500} rows={3} className="field-input mt-1 text-base" />
      </div>

      {botveld && (
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
          <label>
            Laat dit veld leeg
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>
      )}

      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <button type="submit" disabled={bezig} className="btn-primary min-h-12 w-full px-4 py-3 text-base disabled:opacity-60">
        {bezig ? "Bezig met insturen…" : "Checklist afronden"}
      </button>
      <p className="text-xs text-neutralx-500">Na het afronden kun je niets meer aanpassen; een vergissing los je op met een nieuwe uitvoering.</p>
    </form>
  );
}
