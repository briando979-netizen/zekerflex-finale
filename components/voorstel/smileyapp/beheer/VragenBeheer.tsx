"use client";

import { useCallback, useEffect, useState } from "react";
import { ANTWOORD_MAX, ANTWOORD_MIN, VRAAG_MAX, VRAAG_MIN, VRAGEN_MAX, platteTekst, type BeheerVraag, type VraagSoort } from "@/lib/voorstel/smileyapp-vraag-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Vragen" in het beheer (deel 6a): de veelgestelde vragen van de site. Een
// beheerder voegt vragen toe, past ze aan, zet ze in een andere volgorde,
// verbergt ze en gaat terug naar de standaard; een medewerker leest mee. Wat
// hier staat, is ook wat de chat op de site weet. Na elke wijziging neemt het
// scherm de lijst van de server over.

const URL_INHOUD = `${BEHEER_API}/inhoud`;

interface Gegevens {
  vragen: BeheerVraag[];
  aangepast: boolean;
}

const SOORT_LABEL: Record<VraagSoort, string> = { standaard: "Standaard", aangepast: "Aangepast", eigen: "Eigen vraag" };

function Invoeren({ id, begin, soort, bezig, bewaar, sluit }: { id: string | undefined; begin: { vraag: string; antwoord: string }; soort: VraagSoort | undefined; bezig: boolean; bewaar: (id: string | undefined, v: { vraag: string; antwoord: string }) => void; sluit: () => void }) {
  const [v, setV] = useState(begin);
  return (
    <section aria-labelledby="sm-vraag-invoer-kop" className={KAART}>
      <h3 id="sm-vraag-invoer-kop" className="font-display text-xl font-bold text-smiley-ink">
        {id ? "Vraag bewerken" : "Vraag toevoegen"}
      </h3>
      {soort === "standaard" && (
        <p className="mt-2 text-sm leading-relaxed text-smiley-mute">
          Dit is een standaardvraag. Met een eigen tekst volgt het antwoord de prijzen en looptijden uit Pakketten niet meer vanzelf. Met &ldquo;Terug naar de standaard&rdquo; krijg je de oude tekst terug.
        </p>
      )}
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="sm-vraag-vraag" className={LABEL}>
            Vraag
          </label>
          <input id="sm-vraag-vraag" type="text" maxLength={VRAAG_MAX} value={v.vraag} onChange={(e) => setV((x) => ({ ...x, vraag: e.target.value }))} aria-describedby="sm-vraag-vraag-uitleg" className={`mt-1.5 ${VELD}`} />
          <p id="sm-vraag-vraag-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            Minstens {VRAAG_MIN} en hooguit {VRAAG_MAX} tekens; nu {platteTekst(v.vraag).length}.
          </p>
        </div>
        <div>
          <label htmlFor="sm-vraag-antwoord" className={LABEL}>
            Antwoord
          </label>
          <textarea id="sm-vraag-antwoord" rows={6} maxLength={ANTWOORD_MAX} value={v.antwoord} onChange={(e) => setV((x) => ({ ...x, antwoord: e.target.value }))} aria-describedby="sm-vraag-antwoord-uitleg" className={`mt-1.5 ${VELD}`} />
          <p id="sm-vraag-antwoord-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            Gewone tekst zonder opmaak, minstens {ANTWOORD_MIN} en hooguit {ANTWOORD_MAX} tekens; nu {platteTekst(v.antwoord).length}. Schrijf alleen wat klopt: de chat op de site geeft dit antwoord ook.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={bezig} onClick={() => bewaar(id, v)} className={KNOP}>
          {bezig ? "Bezig…" : "Bewaar de vraag"}
        </button>
        <button type="button" disabled={bezig} onClick={sluit} className={KNOP_LICHT}>
          Annuleren
        </button>
      </div>
    </section>
  );
}

export function VragenBeheer({ rol }: { rol: "beheerder" | "medewerker" }) {
  const [data, setData] = useState<Gegevens | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  /** null = dicht, "" = nieuw, anders het id van de vraag die open staat */
  const [open, setOpen] = useState<string | null>(null);
  const [zeker, setZeker] = useState<string | null>(null);
  const magWijzigen = rol === "beheerder";

  const laad = useCallback(async () => {
    try {
      setData(await vraag<Gegevens>(`${URL_INHOUD}?deel=vragen`));
    } catch (e) {
      setFout(foutTekst(e, "De vragen laden lukte niet."));
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
      // de lijst van de server overnemen, niet zelf één vraag bijwerken
      setData(await vraag<Gegevens>(URL_INHOUD, { method: "POST", body }));
      setOk(klaar);
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Dat lukte niet."));
      return false;
    } finally {
      setBezig(false);
    }
  }

  const bewaar = (id: string | undefined, v: { vraag: string; antwoord: string }) =>
    void doe({ actie: "vraag-bewaren", ...(id ? { id } : {}), ...v }, "Bewaard. De vraag staat zo op de site en in de chat.").then((gelukt) => {
      if (gelukt) setOpen(null);
    });

  const lijst = data?.vragen ?? [];
  const bewerk = lijst.find((x) => x.id === open);
  const vol = lijst.length >= VRAGEN_MAX;
  const zichtbaar = lijst.filter((x) => !x.verborgen).length;
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        De veelgestelde vragen op de voorpagina. De chat op de site gebruikt dezelfde vragen en antwoorden. De Engelse en Duitse pagina volgen de volgorde en het verbergen; een vraag met een eigen tekst en een eigen vraag staan alleen op de
        Nederlandse pagina.
      </p>
      {!magWijzigen && <p className={`${KAART} text-sm font-semibold text-smiley-ink`}>Je kunt de vragen hier lezen. Wijzigen kan alleen een beheerder.</p>}
      <Melding fout={fout} ok={ok} />

      {magWijzigen &&
        (open === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={vol || data === null} onClick={() => setOpen("")} className={KNOP}>
              Vraag toevoegen
            </button>
            {data?.aangepast &&
              (zeker === "alles" ? (
                <>
                  <span className="text-sm font-semibold text-[#8E2A1E]">Alle wijzigingen en eigen vragen weghalen?</span>
                  <button type="button" disabled={bezig} onClick={() => void doe({ actie: "vraag-standaard" }, "De vragen staan weer op de standaard.").then(() => setZeker(null))} className={KNOP_ROOD}>
                    Ja, terug naar de standaard
                  </button>
                  <button type="button" disabled={bezig} onClick={() => setZeker(null)} className={KNOP_LICHT}>
                    Nee
                  </button>
                </>
              ) : (
                <button type="button" disabled={bezig} onClick={() => setZeker("alles")} className={KNOP_LICHT}>
                  Alles terug naar de standaard
                </button>
              ))}
            {vol && <p className="w-full text-sm text-smiley-mute">Er staan al {VRAGEN_MAX} vragen. Verwijder eerst een eigen vraag.</p>}
          </div>
        ) : (
          <Invoeren key={open || "nieuw"} id={open || undefined} begin={bewerk ? { vraag: bewerk.vraag, antwoord: bewerk.antwoord } : { vraag: "", antwoord: "" }} soort={bewerk?.soort} bezig={bezig} bewaar={bewaar} sluit={() => setOpen(null)} />
        ))}

      <section aria-labelledby="sm-vraag-lijst-kop">
        <h3 id="sm-vraag-lijst-kop" className="font-display text-xl font-bold text-smiley-ink">
          De vragen op de site
        </h3>
        {data === null ? (
          <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-smiley-mute">
              {zichtbaar} van de {lijst.length} zichtbaar, in deze volgorde.
            </p>
            <ol className="mt-3 space-y-3">
              {lijst.map((v, n) => (
                <li key={v.id} className={KAART}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-display text-lg font-bold text-smiley-ink">
                      {n + 1}. {v.vraag}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {v.soort !== "standaard" && <Pil label={SOORT_LABEL[v.soort]} kleur="bg-smiley-sun text-smiley-ink" />}
                      <Pil label={v.verborgen ? "Verborgen" : "Op de site"} kleur={v.verborgen ? "bg-smiley-ink/10 text-smiley-ink" : "bg-smiley-mint text-smiley-leaf"} />
                    </div>
                  </div>
                  <p className="mt-2 break-words text-sm leading-relaxed text-smiley-ink">{v.antwoord}</p>
                  {magWijzigen && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-smiley-ink/10 pt-4">
                      <button type="button" disabled={bezig || n === 0} onClick={() => void doe({ actie: "vraag-verplaatsen", id: v.id, richting: "op" }, "De volgorde is bewaard.")} className={`relative ${KNOP_LICHT}`}>
                        Omhoog<span className="sr-only">: {v.vraag}</span>
                      </button>
                      <button type="button" disabled={bezig || n === lijst.length - 1} onClick={() => void doe({ actie: "vraag-verplaatsen", id: v.id, richting: "neer" }, "De volgorde is bewaard.")} className={`relative ${KNOP_LICHT}`}>
                        Omlaag<span className="sr-only">: {v.vraag}</span>
                      </button>
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={() => {
                          setOpen(v.id);
                          window.scrollTo({ top: 0 });
                        }}
                        className={`relative ${KNOP_LICHT}`}
                      >
                        Bewerken<span className="sr-only">: {v.vraag}</span>
                      </button>
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={() => void doe({ actie: "vraag-verbergen", id: v.id, verborgen: !v.verborgen }, v.verborgen ? "De vraag staat weer op de site." : "De vraag is verborgen en staat niet meer op de site.")}
                        className={`relative ${KNOP_LICHT}`}
                      >
                        {v.verborgen ? "Toon op de site" : "Verberg op de site"}
                        <span className="sr-only">: {v.vraag}</span>
                      </button>
                      {v.soort === "aangepast" && (
                        <button type="button" disabled={bezig} onClick={() => void doe({ actie: "vraag-standaard", id: v.id }, "De vraag heeft weer de standaardtekst.")} className={`relative ${KNOP_LICHT}`}>
                          Terug naar de standaard<span className="sr-only">: {v.vraag}</span>
                        </button>
                      )}
                      {v.soort === "eigen" &&
                        (zeker === v.id ? (
                          <>
                            <span className="text-sm font-semibold text-[#8E2A1E]">Deze vraag verwijderen?</span>
                            <button type="button" disabled={bezig} onClick={() => void doe({ actie: "vraag-verwijderen", id: v.id }, "Vraag verwijderd.").then(() => setZeker(null))} className={KNOP_ROOD}>
                              Ja, verwijder
                            </button>
                            <button type="button" disabled={bezig} onClick={() => setZeker(null)} className={KNOP_LICHT}>
                              Nee
                            </button>
                          </>
                        ) : (
                          <button type="button" disabled={bezig} onClick={() => setZeker(v.id)} className={`relative ${KNOP_ROOD}`}>
                            Verwijderen<span className="sr-only">: {v.vraag}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
