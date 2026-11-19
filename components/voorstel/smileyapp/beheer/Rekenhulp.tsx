"use client";

import { useCallback, useEffect, useState } from "react";
import { BRON_MAX, BRON_MIN, RESPONS_MAX, RESPONS_MIN, type Respons } from "@/lib/voorstel/smileyapp-rekenhulp-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// De rekenhulp op de site in het beheer (deel 6b), onder het overzicht. De site
// toont het blok "Hoeveel reacties mag je verwachten?" alleen als hier een
// responspercentage staat, met een zin over waar dat cijfer vandaan komt; die
// zin staat op de site onder de uitkomst. Er is geen standaard en geen
// voorbeeld: het cijfer is van SmileyApp zelf. Leeg maken haalt het blok weer
// van de site. Alleen een beheerder vult in of maakt leeg; een medewerker ziet
// wat er staat.

const URL_INHOUD = `${BEHEER_API}/inhoud`;

interface Instellingen {
  respons?: Respons;
}

export function Rekenhulp({ rol }: { rol: "beheerder" | "medewerker" }) {
  /** undefined = nog aan het laden, null = niets ingesteld */
  const [respons, setRespons] = useState<Respons | null | undefined>(undefined);
  const [percentage, setPercentage] = useState("");
  const [bron, setBron] = useState("");
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const beheerder = rol === "beheerder";

  /** De versie van de server overnemen, ook in de velden. */
  const neemOver = useCallback((i: Instellingen) => {
    setRespons(i.respons ?? null);
    setPercentage(i.respons ? String(i.respons.percentage) : "");
    setBron(i.respons?.bron ?? "");
  }, []);

  const laad = useCallback(async () => {
    try {
      neemOver(await vraag<Instellingen>(`${URL_INHOUD}?deel=instellingen`));
    } catch (e) {
      setFout(foutTekst(e, "De instelling laden lukte niet."));
    }
  }, [neemOver]);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function doe(body: Record<string, unknown>, klaar: string) {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      neemOver(await vraag<Instellingen>(URL_INHOUD, { method: "POST", body }));
      setOk(klaar);
    } catch (e) {
      setFout(foutTekst(e, "Opslaan lukte niet."));
    } finally {
      setBezig(false);
      setZeker(false);
    }
  }

  return (
    <section aria-labelledby="sm-rekenhulp-kop" className={KAART}>
      <h3 id="sm-rekenhulp-kop" className="font-display text-xl font-bold text-smiley-ink">
        Rekenhulp op de site
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Op de voorpagina en bij &ldquo;Stel je vragenlijst samen&rdquo; kan een rekenhulp staan: een bezoeker vult in hoeveel klanten of gasten hij per maand heeft en ziet hoeveel reacties hij ongeveer mag verwachten. De rekenhulp staat er alleen als hier
        een responspercentage is ingevuld, met erbij waar dat cijfer vandaan komt. Vul alleen een cijfer in dat jullie kunnen onderbouwen: de bron staat op de site onder de uitkomst.
      </p>
      {respons === undefined ? (
        !fout && <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
      ) : (
        <>
          <p className={`mt-4 rounded-2xl p-3 text-sm font-semibold ${respons ? "bg-smiley-mint text-smiley-leaf" : "bg-smiley-ink/5 text-smiley-ink"}`}>
            {respons ? "De rekenhulp staat nu op de site." : "De rekenhulp staat nu niet op de site: er is geen percentage ingevuld."}
          </p>
          {beheerder ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
              <div>
                <label htmlFor="sm-respons-percentage" className={LABEL}>
                  Responspercentage
                </label>
                <input id="sm-respons-percentage" type="text" inputMode="numeric" maxLength={3} autoComplete="off" value={percentage} onChange={(e) => setPercentage(e.target.value)} aria-describedby="sm-respons-percentage-uitleg" className={`mt-1.5 ${VELD}`} />
                <p id="sm-respons-percentage-uitleg" className="mt-1.5 text-sm text-smiley-mute">
                  Een heel getal van {RESPONS_MIN} tot en met {RESPONS_MAX}, zonder procentteken.
                </p>
              </div>
              <div>
                <label htmlFor="sm-respons-bron" className={LABEL}>
                  Waar komt dit cijfer vandaan?
                </label>
                <input id="sm-respons-bron" type="text" maxLength={BRON_MAX} autoComplete="off" value={bron} onChange={(e) => setBron(e.target.value)} aria-describedby="sm-respons-bron-uitleg" className={`mt-1.5 ${VELD}`} />
                <p id="sm-respons-bron-uitleg" className="mt-1.5 text-sm text-smiley-mute">
                  Verplicht, minstens {BRON_MIN} en hooguit {BRON_MAX} tekens; nu {bron.trim().length}. Deze zin staat op de site onder de uitkomst.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <button type="button" disabled={bezig} onClick={() => void doe({ actie: "respons-bewaren", percentage: percentage.trim(), bron }, "Bewaard. De rekenhulp staat op de site.")} className={KNOP}>
                  {bezig ? "Bezig…" : "Bewaar en toon op de site"}
                </button>
                {respons &&
                  (zeker ? (
                    <>
                      <span className="text-sm font-semibold text-[#8E2A1E]">De rekenhulp van de site halen?</span>
                      <button type="button" disabled={bezig} onClick={() => void doe({ actie: "respons-wissen" }, "Leeg gemaakt. De rekenhulp staat niet meer op de site.")} className={KNOP_ROOD}>
                        Ja, maak leeg
                      </button>
                      <button type="button" disabled={bezig} onClick={() => setZeker(false)} className={KNOP_LICHT}>
                        Nee
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={bezig} onClick={() => setZeker(true)} className={KNOP_LICHT}>
                      Maak leeg (rekenhulp van de site)
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <>
              {respons && (
                <dl className="mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="font-semibold text-smiley-mute">Responspercentage</dt>
                    <dd className="font-semibold text-smiley-ink">{respons.percentage}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-smiley-mute">Waar het cijfer vandaan komt</dt>
                    <dd className="break-words font-semibold text-smiley-ink">{respons.bron}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-3 text-sm text-smiley-mute">Alleen een beheerder vult de rekenhulp in of maakt hem leeg.</p>
            </>
          )}
        </>
      )}
      <div className="mt-3 empty:hidden">
        <Melding fout={fout} ok={ok} />
      </div>
    </section>
  );
}
