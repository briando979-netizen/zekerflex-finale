"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_MINUTEN, OPEN_TIJDEN_MAX, afspraakTekst, type Tijd } from "@/lib/voorstel/smileyapp-agenda-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Agenda" in het beheer (deel 6a): het team zet tijden open voor een demo
// (datum en begintijd in Nederlandse tijd, vaste duur) en haalt ze weer weg. Een
// aanvrager kiest op de demopagina een open tijd; die staat hier dan als
// geboekt, met wie hem boekte. Een boeking annuleren maakt de tijd weer vrij.
// Na elke wijziging komt de hele agenda van de server terug.

const URL_AGENDA = `${BEHEER_API}/agenda`;

/** Een tijd zoals de server hem voor het beheer geeft: met de boeker, als hij geboekt is. */
interface BeheerTijd extends Tijd {
  boeker?: { naam: string; bedrijf: string };
}

interface Gegevens {
  tijden: BeheerTijd[];
  /** het moment van laden (ISO): wat daarvoor begon, is geweest */
  geladen: string;
}

export function Agenda({ vandaag, bijgewerkt }: { vandaag: string; bijgewerkt: () => void }) {
  const [data, setData] = useState<Gegevens | null>(null);
  const [datum, setDatum] = useState("");
  const [tijd, setTijd] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [zeker, setZeker] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      const { tijden } = await vraag<{ tijden: BeheerTijd[] }>(URL_AGENDA);
      setData({ tijden, geladen: new Date().toISOString() });
    } catch (e) {
      setFout(foutTekst(e, "De agenda laden lukte niet."));
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function doe(body: Record<string, unknown>, klaar: string): Promise<boolean> {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      // de agenda van de server overnemen, niet zelf één tijd bijwerken
      const { tijden } = await vraag<{ tijden: BeheerTijd[] }>(URL_AGENDA, { method: "POST", body });
      setData({ tijden, geladen: new Date().toISOString() });
      setOk(klaar);
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Dat lukte niet."));
      // de agenda kan intussen veranderd zijn (een aanvrager boekte net): opnieuw ophalen
      void laad();
      return false;
    } finally {
      setBezig(false);
    }
  }

  const tijden = data?.tijden ?? [];
  const straks = tijden.filter((t) => !data || t.start > data.geladen);
  const geweest = tijden.filter((t) => data && t.start <= data.geladen);
  const open = straks.filter((t) => t.status === "open").length;
  const vol = open >= OPEN_TIJDEN_MAX;

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Zet hier tijden open voor een demo van {DEMO_MINUTEN} minuten. Op de demopagina kiest een aanvrager er een; de afspraak staat dan meteen vast en de aanvrager krijgt een bevestiging per mail. Staat er niets open, dan vraagt het
        formulier om een voorkeursmoment, zoals voorheen.
      </p>
      <Melding fout={fout} ok={ok} />

      <section aria-labelledby="sm-agenda-nieuw-kop" className={KAART}>
        <h3 id="sm-agenda-nieuw-kop" className="font-display text-xl font-bold text-smiley-ink">
          Tijd openzetten
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor="sm-agenda-datum" className={LABEL}>
              Datum
            </label>
            <input id="sm-agenda-datum" type="date" min={vandaag} value={datum} onChange={(e) => setDatum(e.target.value)} className={`mt-1.5 ${VELD}`} />
          </div>
          <div className="min-w-0">
            <label htmlFor="sm-agenda-tijd" className={LABEL}>
              Begintijd <span className="font-normal text-smiley-mute">(Nederlandse tijd)</span>
            </label>
            <input id="sm-agenda-tijd" type="time" step={300} value={tijd} onChange={(e) => setTijd(e.target.value)} aria-describedby="sm-agenda-uitleg" className={`mt-1.5 ${VELD}`} />
          </div>
          <button
            type="button"
            disabled={bezig || vol || !datum || !tijd}
            onClick={() =>
              void doe({ actie: "open", datum, tijd: tijd.slice(0, 5) }, "De tijd staat open op de demopagina.").then((gelukt) => {
                if (gelukt) setTijd("");
              })
            }
            className={KNOP}
          >
            Zet open
          </button>
        </div>
        <p id="sm-agenda-uitleg" className="mt-3 text-sm text-smiley-mute">
          Alleen in de toekomst, op vijf minuten (zoals 10:00 of 10:15). Een demo duurt {DEMO_MINUTEN} minuten; tijden mogen elkaar niet overlappen. Er staan nu {open} tijden open (hooguit {OPEN_TIJDEN_MAX}).
        </p>
      </section>

      <section aria-labelledby="sm-agenda-lijst-kop">
        <h3 id="sm-agenda-lijst-kop" className="font-display text-xl font-bold text-smiley-ink">
          Komende tijden
        </h3>
        {data === null ? (
          <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
        ) : straks.length === 0 ? (
          <p className={`mt-3 ${KAART} text-smiley-mute`}>Er staan geen tijden in de agenda. Het demoformulier vraagt nu om een voorkeursmoment.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {straks.map((t) => (
              <li key={t.id} className={KAART}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-display text-lg font-bold text-smiley-ink">{afspraakTekst(t.start)}</p>
                    <p className="mt-1 break-words text-sm text-smiley-mute">
                      {t.status === "geboekt" ? (t.boeker ? `Geboekt door ${t.boeker.naam} van ${t.boeker.bedrijf}.` : "Geboekt; de aanvraag is er niet meer.") : `Opengezet door ${t.door}.`}
                    </p>
                  </div>
                  <Pil label={t.status === "geboekt" ? "Geboekt" : "Open"} kleur={t.status === "geboekt" ? "bg-sky-100 text-sky-900" : "bg-smiley-mint text-smiley-leaf"} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-smiley-ink/10 pt-4">
                  {t.status === "open" ? (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "weg", id: t.id }, "De tijd is weggehaald.")} className={KNOP_LICHT}>
                      Haal weg<span className="sr-only">: {afspraakTekst(t.start)}</span>
                    </button>
                  ) : zeker === t.id ? (
                    <>
                      <span className="text-sm font-semibold text-[#8E2A1E]">De boeking annuleren? De aanvrager krijgt hier geen bericht van: bel of mail zelf.</span>
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={() =>
                          void doe({ actie: "annuleer", id: t.id }, "De boeking is geannuleerd. De tijd staat weer open.").then(() => {
                            setZeker(null);
                            bijgewerkt();
                          })
                        }
                        className={KNOP_ROOD}
                      >
                        Ja, annuleer
                      </button>
                      <button type="button" disabled={bezig} onClick={() => setZeker(null)} className={KNOP_LICHT}>
                        Nee
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={bezig} onClick={() => setZeker(t.id)} className={KNOP_ROOD}>
                      Annuleer de boeking<span className="sr-only">: {afspraakTekst(t.start)}</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {geweest.length > 0 && (
        <section aria-labelledby="sm-agenda-geweest-kop">
          <h3 id="sm-agenda-geweest-kop" className="font-display text-xl font-bold text-smiley-ink">
            Geweest
          </h3>
          <ul className={`mt-3 divide-y divide-smiley-ink/10 ${KAART}`}>
            {geweest.map((t) => (
              <li key={t.id} className="break-words py-2 text-sm text-smiley-ink">
                <span className="font-semibold">{afspraakTekst(t.start)}</span>
                {t.boeker ? `, ${t.boeker.naam} van ${t.boeker.bedrijf}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-smiley-mute">Een geboekte tijd verdwijnt hier vanzelf dertig dagen na afloop.</p>
        </section>
      )}
    </div>
  );
}
