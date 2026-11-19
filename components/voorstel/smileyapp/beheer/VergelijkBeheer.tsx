"use client";

import { useCallback, useEffect, useState } from "react";
import { EIGEN_RIJEN_MAX, RIJ_VELD_MAX, RIJ_VELD_MIN, type BeheerRij } from "@/lib/voorstel/smileyapp-vergelijk-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Vergelijken" in het beheer (deel 6b): de rijen van de pagina "Smileyapp of
// een papieren enquête?". De standaardrijen bevatten in de kolom Smileyapp
// alleen zinnen van smileyapp.nl; een beheerder kan er eigen rijen bij zetten
// (hooguit twaalf) en een standaardrij verbergen. Een medewerker leest mee. Na
// elke wijziging neemt het scherm de lijst van de server over.

const URL_INHOUD = `${BEHEER_API}/inhoud`;

interface Gegevens {
  rijen: BeheerRij[];
  aangepast: boolean;
}

const LEEG = { kenmerk: "", smileyapp: "", papier: "" };
const VELDEN = [
  ["kenmerk", "Kenmerk", "Waar de rij over gaat, bijvoorbeeld: Invullen."],
  ["smileyapp", "Smileyapp", "Hoe het met Smileyapp gaat. Schrijf alleen wat klopt."],
  ["papier", "Papieren enquête", "Hoe het met een papieren formulier gaat. Zonder een merk of een ander bedrijf te noemen."],
] as const;

export function VergelijkBeheer({ rol }: { rol: "beheerder" | "medewerker" }) {
  const [data, setData] = useState<Gegevens | null>(null);
  const [nieuw, setNieuw] = useState(LEEG);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState<string | null>(null);
  const magWijzigen = rol === "beheerder";

  const laad = useCallback(async () => {
    try {
      setData(await vraag<Gegevens>(`${URL_INHOUD}?deel=vergelijken`));
    } catch (e) {
      setFout(foutTekst(e, "De vergelijking laden lukte niet."));
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
      // de lijst van de server overnemen, niet zelf één rij bijwerken
      setData(await vraag<Gegevens>(URL_INHOUD, { method: "POST", body }));
      setOk(klaar);
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Dat lukte niet."));
      return false;
    } finally {
      setBezig(false);
      setZeker(null);
    }
  }

  const rijen = data?.rijen ?? [];
  const eigen = rijen.filter((r) => r.eigen).length;
  const vol = eigen >= EIGEN_RIJEN_MAX;
  const zichtbaar = rijen.filter((r) => !r.verborgen).length;

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        De tabel op de pagina &ldquo;Smileyapp of een papieren enquête?&rdquo;. In de standaardrijen staat bij Smileyapp alleen een zin van jullie eigen site. De Engelse en Duitse pagina tonen de standaardrijen vertaald; een eigen rij blijft
        in de taal waarin je hem schrijft.
      </p>
      {!magWijzigen && <p className={`${KAART} text-sm font-semibold text-smiley-ink`}>Je kunt de vergelijking hier lezen. Wijzigen kan alleen een beheerder.</p>}
      <Melding fout={fout} ok={ok} />

      {magWijzigen && (
        <section aria-labelledby="sm-vergelijk-nieuw-kop" className={KAART}>
          <h3 id="sm-vergelijk-nieuw-kop" className="font-display text-xl font-bold text-smiley-ink">
            Eigen rij toevoegen
          </h3>
          <p className="mt-2 text-sm text-smiley-mute">
            {eigen} van de {EIGEN_RIJEN_MAX} eigen rijen gebruikt. Elk veld: minstens {RIJ_VELD_MIN} en hooguit {RIJ_VELD_MAX} tekens.
          </p>
          <div className="mt-4 space-y-4">
            {VELDEN.map(([veld, label, uitleg]) => (
              <div key={veld}>
                <label htmlFor={`sm-vergelijk-${veld}`} className={LABEL}>
                  {label}
                </label>
                <input
                  id={`sm-vergelijk-${veld}`}
                  type="text"
                  maxLength={RIJ_VELD_MAX}
                  autoComplete="off"
                  value={nieuw[veld]}
                  onChange={(e) => setNieuw((n) => ({ ...n, [veld]: e.target.value }))}
                  aria-describedby={`sm-vergelijk-${veld}-uitleg`}
                  className={`mt-1.5 ${VELD}`}
                />
                <p id={`sm-vergelijk-${veld}-uitleg`} className="mt-1.5 text-sm text-smiley-mute">
                  {uitleg} Nu {nieuw[veld].trim().length} tekens.
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <button
              type="button"
              disabled={bezig || vol || data === null}
              onClick={() =>
                void doe({ actie: "vergelijk-toevoegen", ...nieuw }, "Toegevoegd. De rij staat op de site.").then((gelukt) => {
                  if (gelukt) setNieuw(LEEG);
                })
              }
              className={KNOP}
            >
              {bezig ? "Bezig…" : "Voeg de rij toe"}
            </button>
            {vol && <p className="mt-2 text-sm text-smiley-mute">Er staan al {EIGEN_RIJEN_MAX} eigen rijen. Verwijder er eerst een.</p>}
          </div>
        </section>
      )}

      <section aria-labelledby="sm-vergelijk-lijst-kop">
        <h3 id="sm-vergelijk-lijst-kop" className="font-display text-xl font-bold text-smiley-ink">
          De rijen op de site
        </h3>
        {data === null ? (
          !fout && <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-smiley-mute">
              {zichtbaar} van de {rijen.length} zichtbaar. Er blijft altijd minstens één rij staan.
            </p>
            <ol className="mt-3 space-y-3">
              {rijen.map((r) => (
                <li key={r.id} className={KAART}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-display text-lg font-bold text-smiley-ink">{r.kenmerk}</p>
                    <div className="flex flex-wrap gap-2">
                      {r.eigen && <Pil label="Eigen rij" kleur="bg-smiley-sun text-smiley-ink" />}
                      <Pil label={r.verborgen ? "Verborgen" : "Op de site"} kleur={r.verborgen ? "bg-smiley-ink/10 text-smiley-ink" : "bg-smiley-mint text-smiley-leaf"} />
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-smiley-mute">Smileyapp</dt>
                      <dd className="mt-0.5 break-words leading-relaxed text-smiley-ink">{r.smileyapp}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-smiley-mute">Papieren enquête</dt>
                      <dd className="mt-0.5 break-words leading-relaxed text-smiley-ink">{r.papier}</dd>
                    </div>
                  </dl>
                  {magWijzigen && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-smiley-ink/10 pt-4">
                      {!r.eigen && (
                        <button
                          type="button"
                          disabled={bezig}
                          onClick={() => void doe({ actie: "vergelijk-verbergen", id: r.id, verborgen: !r.verborgen }, r.verborgen ? "De rij staat weer op de site." : "De rij is verborgen en staat niet meer op de site.")}
                          className={`relative ${KNOP_LICHT}`}
                        >
                          {r.verborgen ? "Toon op de site" : "Verberg op de site"}
                          <span className="sr-only">: {r.kenmerk}</span>
                        </button>
                      )}
                      {r.eigen &&
                        (zeker === r.id ? (
                          <>
                            <span className="text-sm font-semibold text-[#8E2A1E]">Deze rij verwijderen?</span>
                            <button type="button" disabled={bezig} onClick={() => void doe({ actie: "vergelijk-verwijderen", id: r.id }, "Rij verwijderd.")} className={KNOP_ROOD}>
                              Ja, verwijder
                            </button>
                            <button type="button" disabled={bezig} onClick={() => setZeker(null)} className={KNOP_LICHT}>
                              Nee
                            </button>
                          </>
                        ) : (
                          <button type="button" disabled={bezig} onClick={() => setZeker(r.id)} className={`relative ${KNOP_ROOD}`}>
                            Verwijderen<span className="sr-only">: {r.kenmerk}</span>
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
