"use client";

import { useCallback, useEffect, useState } from "react";
import { sterren } from "@/lib/voorstel/review-weergave";
import {
  LINK_MAX,
  NAAM_MAX,
  ORGANISATIE_MAX,
  REVIEWS_GETOOND,
  REVIEWS_MAX,
  REVIEW_BRONNEN,
  TEKST_MAX,
  TEKST_MIN,
  alsReviewInvoer,
  reviewDatum,
  reviewOverzicht,
  samenvattingTekst,
  sterrenTekst,
  type Review,
  type ReviewInvoer,
} from "@/lib/voorstel/smileyapp-review-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Reviews" in het beheer: het team neemt reviews over die het echt kreeg
// (Google, Trustpilot, e-mail of ergens anders), met de bron erbij. Er is geen
// koppeling met een dienst van buiten. Een review staat op de site zodra hij
// zichtbaar is; zonder zichtbare review is het blok op de site er niet.

const URL_INHOUD = `${BEHEER_API}/inhoud`;
const LEEG: ReviewInvoer = { naam: "", organisatie: "", sterren: 5, tekst: "", bron: "Google", bronLink: "", datum: "", zichtbaar: true };

function Invoeren({ id, begin, vandaag, bezig, bewaar, sluit }: { id: string | undefined; begin: ReviewInvoer; vandaag: string; bezig: boolean; bewaar: (id: string | undefined, r: ReviewInvoer) => void; sluit: () => void }) {
  const [r, setR] = useState<ReviewInvoer>(begin);
  const zet = <K extends keyof ReviewInvoer>(veld: K, waarde: ReviewInvoer[K]) => setR((x) => ({ ...x, [veld]: waarde }));
  return (
    <section aria-labelledby="sm-review-invoer-kop" className={KAART}>
      <h3 id="sm-review-invoer-kop" className="font-display text-xl font-bold text-smiley-ink">
        {id ? "Review bewerken" : "Review toevoegen"}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sm-review-naam" className={LABEL}>
            Naam <span className="font-normal text-smiley-mute">(zoals de schrijver hem zelf gebruikte)</span>
          </label>
          <input id="sm-review-naam" type="text" maxLength={NAAM_MAX} value={r.naam} onChange={(e) => zet("naam", e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <div>
          <label htmlFor="sm-review-organisatie" className={LABEL}>
            Organisatie of functie <span className="font-normal text-smiley-mute">(mag leeg blijven)</span>
          </label>
          <input id="sm-review-organisatie" type="text" maxLength={ORGANISATIE_MAX} value={r.organisatie} onChange={(e) => zet("organisatie", e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Aantal sterren</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className={`relative cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors focus-within:ring-2 focus-within:ring-smiley-leaf ${r.sterren === n ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-white text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
              >
                <input type="radio" name="sm-review-sterren" checked={r.sterren === n} onChange={() => zet("sterren", n)} className="sr-only" />
                {n} {n === 1 ? "ster" : "sterren"}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label htmlFor="sm-review-tekst" className={LABEL}>
            Tekst van de review
          </label>
          <textarea id="sm-review-tekst" rows={5} maxLength={TEKST_MAX} value={r.tekst} onChange={(e) => zet("tekst", e.target.value)} aria-describedby="sm-review-tekst-uitleg" className={`mt-1.5 ${VELD}`} />
          <p id="sm-review-tekst-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            Neem de tekst letterlijk over, in de taal waarin hij is geschreven. Minstens {TEKST_MIN} en hooguit {TEKST_MAX} tekens; nu {r.tekst.trim().length}.
          </p>
        </div>
        <div>
          <label htmlFor="sm-review-bron" className={LABEL}>
            Bron
          </label>
          <select id="sm-review-bron" value={r.bron} onChange={(e) => zet("bron", e.target.value)} className={`mt-1.5 ${VELD}`}>
            {REVIEW_BRONNEN.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sm-review-datum" className={LABEL}>
            Datum van de review <span className="font-normal text-smiley-mute">(mag leeg blijven)</span>
          </label>
          <input id="sm-review-datum" type="date" max={vandaag} value={r.datum} onChange={(e) => zet("datum", e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="sm-review-link" className={LABEL}>
            Link naar de review bij de bron <span className="font-normal text-smiley-mute">(mag leeg blijven)</span>
          </label>
          <input id="sm-review-link" type="url" inputMode="url" maxLength={LINK_MAX} placeholder="https://" value={r.bronLink} onChange={(e) => zet("bronLink", e.target.value)} aria-describedby="sm-review-link-uitleg" className={`mt-1.5 ${VELD}`} />
          <p id="sm-review-link-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            Begint met https://. De site zet er een link bij, zodat een bezoeker de review zelf kan nalezen.
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-smiley-ink sm:col-span-2">
          <input type="checkbox" checked={r.zichtbaar} onChange={(e) => zet("zichtbaar", e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0E2A20]" />
          <span>
            Zichtbaar op de site
            <span className="block font-normal text-smiley-mute">Uit: de review blijft hier bewaard, maar staat niet op de site en telt niet mee in het gemiddelde.</span>
          </span>
        </label>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={bezig} onClick={() => bewaar(id, r)} className={KNOP}>
          {bezig ? "Bezig…" : "Bewaar de review"}
        </button>
        <button type="button" disabled={bezig} onClick={sluit} className={KNOP_LICHT}>
          Annuleren
        </button>
      </div>
    </section>
  );
}

export function ReviewsBeheer({ vandaag }: { vandaag: string }) {
  const [lijst, setLijst] = useState<Review[] | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  /** null = dicht, "" = nieuw, anders het id van de review die open staat */
  const [open, setOpen] = useState<string | null>(null);
  const [zeker, setZeker] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      setLijst((await vraag<{ reviews: Review[] }>(`${URL_INHOUD}?deel=reviews`)).reviews);
    } catch (e) {
      setFout(foutTekst(e, "De reviews laden lukte niet."));
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
      // de lijst van de server overnemen, niet zelf één review bijwerken
      setLijst((await vraag<{ reviews: Review[] }>(URL_INHOUD, { method: "POST", body })).reviews);
      setOk(klaar);
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Dat lukte niet."));
      return false;
    } finally {
      setBezig(false);
    }
  }

  const bewaar = (id: string | undefined, r: ReviewInvoer) =>
    void doe({ actie: "review-bewaren", ...(id ? { id } : {}), ...r }, r.zichtbaar ? "Bewaard. De review staat op de site." : "Bewaard. De review is verborgen en staat niet op de site.").then((gelukt) => {
      if (gelukt) setOpen(null);
    });
  const wissel = (r: Review) =>
    void doe({ actie: "review-bewaren", id: r.id, ...alsReviewInvoer(r), zichtbaar: !r.zichtbaar }, r.zichtbaar ? "De review is verborgen en staat niet meer op de site." : "De review staat weer op de site.");

  const bewerk = lijst?.find((x) => x.id === open);
  const overzicht = lijst ? reviewOverzicht(lijst) : null;
  const vol = (lijst?.length ?? 0) >= REVIEWS_MAX;
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm font-semibold leading-relaxed text-smiley-ink">
        Zet hier alleen reviews die je echt hebt gekregen, met de naam zoals de schrijver hem zelf gebruikte. De site zet erbij dat SmileyApp ze zelf heeft overgenomen.
      </p>
      <Melding fout={fout} ok={ok} />

      {lijst !== null && (
        <p className={`${KAART} text-sm leading-relaxed text-smiley-ink`}>
          {overzicht ? (
            <>
              <span className="font-bold">Op de site: {samenvattingTekst(overzicht)}.</span> De site toont de {REVIEWS_GETOOND} nieuwste; het gemiddelde telt alle zichtbare reviews.
            </>
          ) : (
            "Er staat nog geen zichtbare review. Het blok met reviews is dan niet te zien op de site."
          )}
        </p>
      )}

      {open === null ? (
        <div>
          <button type="button" disabled={vol} onClick={() => setOpen("")} className={KNOP}>
            Review toevoegen
          </button>
          {vol && <p className="mt-2 text-sm text-smiley-mute">Er staan al {REVIEWS_MAX} reviews. Verwijder eerst een oude review.</p>}
        </div>
      ) : (
        <Invoeren key={open || "nieuw"} id={open || undefined} begin={bewerk ? alsReviewInvoer(bewerk) : LEEG} vandaag={vandaag} bezig={bezig} bewaar={bewaar} sluit={() => setOpen(null)} />
      )}

      <section aria-labelledby="sm-review-lijst-kop">
        <h3 id="sm-review-lijst-kop" className="font-display text-xl font-bold text-smiley-ink">
          Ingevoerde reviews
        </h3>
        {lijst === null ? (
          <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
        ) : lijst.length === 0 ? (
          <p className={`mt-3 ${KAART} text-smiley-mute`}>Er zijn nog geen reviews ingevoerd.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {lijst.map((r) => (
              <li key={r.id} className={KAART}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-display text-lg font-bold text-smiley-ink">{r.naam}</p>
                    {r.organisatie && <p className="break-words text-sm text-smiley-mute">{r.organisatie}</p>}
                  </div>
                  <Pil label={r.zichtbaar ? "Op de site" : "Verborgen"} kleur={r.zichtbaar ? "bg-smiley-mint text-smiley-leaf" : "bg-smiley-ink/10 text-smiley-ink"} />
                </div>
                <p className="mt-2 text-sm font-semibold text-smiley-ink">
                  <span aria-hidden="true" className="mr-2 tracking-wider">
                    {sterren(r.sterren)}
                  </span>
                  {sterrenTekst(r.sterren)}
                </p>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-smiley-ink">{r.tekst}</p>
                <p className="mt-2 break-words text-sm text-smiley-mute">
                  Bron: {r.bron}
                  {r.datum ? ` · ${reviewDatum(r.datum)}` : ""}
                  {r.door ? ` · bewaard door ${r.door}` : ""}
                </p>
                {r.bronLink && (
                  <p className="mt-1 text-sm">
                    <a href={r.bronLink} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold text-smiley-leaf underline underline-offset-2">
                      Open de review bij de bron<span className="sr-only"> van {r.naam} (opent een nieuw tabblad)</span>
                    </a>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-smiley-ink/10 pt-4">
                  <button
                    type="button"
                    disabled={bezig}
                    onClick={() => {
                      setOpen(r.id);
                      window.scrollTo({ top: 0 });
                    }}
                    className={KNOP_LICHT}
                  >
                    Bewerken
                  </button>
                  <button type="button" disabled={bezig} onClick={() => wissel(r)} className={KNOP_LICHT}>
                    {r.zichtbaar ? "Verberg op de site" : "Toon op de site"}
                  </button>
                  {zeker === r.id ? (
                    <>
                      <span className="text-sm font-semibold text-[#8E2A1E]">Deze review verwijderen?</span>
                      <button type="button" disabled={bezig} onClick={() => void doe({ actie: "review-verwijderen", id: r.id }, "Review verwijderd.").then(() => setZeker(null))} className={KNOP_ROOD}>
                        Ja, verwijder
                      </button>
                      <button type="button" disabled={bezig} onClick={() => setZeker(null)} className={KNOP_LICHT}>
                        Nee
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={bezig} onClick={() => setZeker(r.id)} className={KNOP_ROOD}>
                      Verwijderen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
