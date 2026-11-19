"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { beeld } from "@/lib/voorstel/smileyapp";
import { POSTER_FORMATEN, POSTER_FORMAAT_NAAM, POSTER_ZIN_MAX, POSTER_ZIN_STANDAARD, leesPosterZin, type PosterFormaat } from "@/lib/voorstel/smileyapp-poster-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, LABEL, Melding, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// De poster om te printen (deel 6a), bij de QR-code in het beheer: A4 of A5,
// staand, met het logo, één korte zin die het team zelf aanpast en de QR-code.
// Alleen HTML en CSS: de pagina-indeling staat in smiley.css (@page), de knop
// roept het printvenster van de browser aan. Alles komt van de eigen site (het
// logo uit de eigen map, de code hier getekend); er wordt niets van buiten geladen.

const URL_INHOUD = `${BEHEER_API}/inhoud`;

export function Poster({ adres, pad, zijde, drukAf, print }: { adres: string; pad: string; zijde: number; drukAf: boolean; print: () => void }) {
  const [formaat, setFormaat] = useState<PosterFormaat>("a4");
  /** de zin zoals hij bewaard is, en wat er nu in het veld staat */
  const [bewaard, setBewaard] = useState(POSTER_ZIN_STANDAARD);
  const [invoer, setInvoer] = useState(POSTER_ZIN_STANDAARD);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");

  const laad = useCallback(async () => {
    try {
      const { posterZin } = await vraag<{ posterZin: string }>(`${URL_INHOUD}?deel=instellingen`);
      setBewaard(posterZin);
      setInvoer(posterZin);
    } catch {
      // de poster werkt ook zonder: dan staat de standaardzin er
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function bewaar() {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      // de versie van de server overnemen (een lege zin wordt daar de standaardzin)
      const { posterZin } = await vraag<{ posterZin: string }>(URL_INHOUD, { method: "POST", body: { actie: "poster-bewaren", zin: invoer } });
      setBewaard(posterZin);
      setInvoer(posterZin);
      setOk("De zin is bewaard voor het hele team.");
    } catch (e) {
      setFout(foutTekst(e, "Bewaren lukte niet."));
    } finally {
      setBezig(false);
    }
  }

  const gelezen = leesPosterZin(invoer);
  const zin = gelezen.ok ? gelezen.waarde : bewaard;
  const kort = adres.replace(/^[a-z]+:\/\//, "");
  return (
    <section aria-labelledby="sm-poster-kop" className={KAART}>
      <div className="sm-niet-printen">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="sm-poster-kop" className="font-display text-xl font-bold text-smiley-ink">
            Poster om te printen
          </h3>
          <button type="button" onClick={print} className={KNOP}>
            Print de poster
          </button>
        </div>
        <p className="mt-1 text-sm text-smiley-mute">
          Kies in het printvenster hetzelfde papier ({POSTER_FORMAAT_NAAM[formaat]}, staand), zet de marges op &ldquo;geen&rdquo; en zet &ldquo;achtergronden&rdquo; aan, dan komen de kleuren mee.
        </p>
        <fieldset className="mt-4">
          <legend className={LABEL}>Formaat</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {POSTER_FORMATEN.map((f) => (
              <label
                key={f}
                className={`relative cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors focus-within:ring-2 focus-within:ring-smiley-leaf ${formaat === f ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-white text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
              >
                <input type="radio" name="sm-poster-formaat" checked={formaat === f} onChange={() => setFormaat(f)} className="sr-only" />
                {POSTER_FORMAAT_NAAM[f]} staand
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <label htmlFor="sm-poster-zin" className={LABEL}>
            De zin op de poster
          </label>
          <input id="sm-poster-zin" type="text" maxLength={POSTER_ZIN_MAX} value={invoer} onChange={(e) => setInvoer(e.target.value)} aria-describedby="sm-poster-zin-uitleg" className={`mt-1.5 ${VELD}`} />
          <p id="sm-poster-zin-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            Hooguit {POSTER_ZIN_MAX} tekens; nu {invoer.trim().length}. Leeg is de standaardzin: &ldquo;{POSTER_ZIN_STANDAARD}&rdquo;.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={bezig || invoer.trim() === bewaard} onClick={() => void bewaar()} className={KNOP_LICHT}>
              Bewaar de zin
            </button>
          </div>
          <div className="mt-2 empty:hidden">
            <Melding fout={fout} ok={ok} />
          </div>
        </div>
      </div>
      {/* de poster zelf: op het scherm een voorbeeld, bij het printen het enige wat op het papier komt (smiley.css) */}
      <div
        className={`${drukAf ? `sm-print-poster sm-print-poster-${formaat}` : "sm-niet-printen"} mx-auto mt-5 flex aspect-[210/297] w-full max-w-[340px] flex-col items-center justify-between overflow-hidden rounded-3xl bg-smiley-cream text-center text-smiley-ink ring-1 ring-smiley-ink/10`}
      >
        <div className="sm-poster-kop flex w-full items-center justify-center bg-smiley-ink px-6 py-5">
          <Image src={beeld("logo.webp")} alt="Smileyapp" width={500} height={260} className="h-auto w-[40%]" />
        </div>
        <p className="sm-poster-zin break-words px-6 font-display text-[1.45rem] font-bold leading-[1.1]">{zin}</p>
        <svg viewBox={`0 0 ${zijde} ${zijde}`} role="img" aria-label={`QR-code naar ${adres}`} shapeRendering="crispEdges" className="h-auto w-[56%] rounded-2xl bg-white ring-1 ring-smiley-ink/10">
          <rect width={zijde} height={zijde} fill="#ffffff" />
          <path d={pad} fill="#0E2A20" />
        </svg>
        <p className="sm-poster-adres break-all px-6 pb-5 text-xs font-semibold text-smiley-mute">{kort}</p>
      </div>
    </section>
  );
}
