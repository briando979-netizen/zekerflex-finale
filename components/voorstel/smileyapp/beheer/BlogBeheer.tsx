"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE, BLOG, datumTekst } from "@/lib/voorstel/smileyapp";
import { BLOG_STATUS_LABEL, SAMENVATTING_MAX, TITEL_MAX, zichtbaar, type BerichtInvoer, type EigenBericht } from "@/lib/voorstel/smileyapp-blog-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, moment, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Blog" in het beheer: het team schrijft extra berichten naast de vier vaste
// berichten van smileyapp.nl (die blijven zoals ze zijn). Een bericht is een
// concept (alleen hier zichtbaar) of gepubliceerd (op de site vanaf de datum).
// De tekst is platte tekst: een lege regel begint een nieuwe alinea.

const URL_INHOUD = `${BEHEER_API}/inhoud`;
const leegBericht = (vandaag: string): BerichtInvoer => ({ titel: "", datum: vandaag, samenvatting: "", tekst: "", status: "concept" });

function Schrijven({ id, begin, bezig, bewaar, sluit }: { id: string | undefined; begin: BerichtInvoer; bezig: boolean; bewaar: (id: string | undefined, b: BerichtInvoer) => void; sluit: () => void }) {
  const [b, setB] = useState<BerichtInvoer>(begin);
  const zet = (veld: keyof BerichtInvoer, waarde: string) => setB((x) => ({ ...x, [veld]: waarde }));
  return (
    <section aria-labelledby="sm-blog-schrijf-kop" className={KAART}>
      <h3 id="sm-blog-schrijf-kop" className="font-display text-xl font-bold text-smiley-ink">
        {id ? "Bericht bewerken" : "Nieuw bericht"}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="sm-blog-titel" className={LABEL}>
            Titel
          </label>
          <input id="sm-blog-titel" type="text" maxLength={TITEL_MAX} value={b.titel} onChange={(e) => zet("titel", e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <div>
          <label htmlFor="sm-blog-datum" className={LABEL}>
            Datum
          </label>
          <input id="sm-blog-datum" type="date" value={b.datum} onChange={(e) => zet("datum", e.target.value)} aria-describedby="sm-blog-datum-uitleg" className={`mt-1.5 ${VELD}`} />
        </div>
        <p id="sm-blog-datum-uitleg" className="-mt-2 text-sm text-smiley-mute sm:col-span-2">
          Een datum in de toekomst: het bericht komt pas op die dag op de site.
        </p>
        <div className="sm:col-span-2">
          <label htmlFor="sm-blog-samenvatting" className={LABEL}>
            Samenvatting <span className="font-normal text-smiley-mute">(staat op de blogpagina onder de titel)</span>
          </label>
          <textarea id="sm-blog-samenvatting" rows={2} maxLength={SAMENVATTING_MAX} value={b.samenvatting} onChange={(e) => zet("samenvatting", e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="sm-blog-tekst" className={LABEL}>
            Tekst
          </label>
          <textarea id="sm-blog-tekst" rows={12} value={b.tekst} onChange={(e) => zet("tekst", e.target.value)} aria-describedby="sm-blog-tekst-uitleg" className={`mt-1.5 ${VELD}`} />
          <p id="sm-blog-tekst-uitleg" className="mt-1.5 text-sm text-smiley-mute">
            Een lege regel begint een nieuwe alinea.
          </p>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Status</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["concept", "gepubliceerd"] as const).map((s) => (
              <label
                key={s}
                className={`relative cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors focus-within:ring-2 focus-within:ring-smiley-leaf ${b.status === s ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-white text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
              >
                <input type="radio" name="sm-blog-status" checked={b.status === s} onChange={() => zet("status", s)} className="sr-only" />
                {s === "concept" ? "Concept (alleen hier zichtbaar)" : "Gepubliceerd (op de site)"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={bezig} onClick={() => bewaar(id, b)} className={KNOP}>
          {bezig ? "Bezig…" : "Bewaar het bericht"}
        </button>
        <button type="button" disabled={bezig} onClick={sluit} className={KNOP_LICHT}>
          Annuleren
        </button>
      </div>
    </section>
  );
}

export function BlogBeheer({ vandaag }: { vandaag: string }) {
  const [lijst, setLijst] = useState<EigenBericht[] | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  /** null = dicht, "" = nieuw, anders het id van het bericht dat open staat */
  const [open, setOpen] = useState<string | null>(null);
  const [zeker, setZeker] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      setLijst((await vraag<{ berichten: EigenBericht[] }>(`${URL_INHOUD}?deel=blog`)).berichten);
    } catch (e) {
      setFout(foutTekst(e, "De berichten laden lukte niet."));
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
      await vraag(URL_INHOUD, { method: "POST", body });
      // de lijst van de server overnemen (slug, tijdstip en naam komen van daar)
      await laad();
      setOk(klaar);
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Dat lukte niet."));
      return false;
    } finally {
      setBezig(false);
    }
  }

  const bewaar = (id: string | undefined, b: BerichtInvoer) =>
    void doe({ actie: "blog-bewaren", ...(id ? { id } : {}), ...b }, b.status === "gepubliceerd" ? (b.datum > vandaag ? `Bewaard. Het bericht komt op ${datumTekst(b.datum)} op de site.` : "Bewaard. Het bericht staat op de site.") : "Bewaard als concept.").then((gelukt) => {
      if (gelukt) setOpen(null);
    });

  const bewerk = lijst?.find((x) => x.id === open);
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Schrijf hier berichten voor de blog. De vier berichten van smileyapp.nl staan er altijd bij; die kun je hier niet wijzigen.
      </p>
      <Melding fout={fout} ok={ok} />

      {open === null ? (
        <button type="button" onClick={() => setOpen("")} className={KNOP}>
          Nieuw bericht schrijven
        </button>
      ) : (
        <Schrijven
          key={open || "nieuw"}
          id={open || undefined}
          begin={bewerk ? { titel: bewerk.titel, datum: bewerk.datum, samenvatting: bewerk.samenvatting, tekst: bewerk.tekst, status: bewerk.status } : leegBericht(vandaag)}
          bezig={bezig}
          bewaar={bewaar}
          sluit={() => setOpen(null)}
        />
      )}

      <section aria-labelledby="sm-blog-eigen-kop">
        <h3 id="sm-blog-eigen-kop" className="font-display text-xl font-bold text-smiley-ink">
          Eigen berichten
        </h3>
        {lijst === null ? (
          <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
        ) : lijst.length === 0 ? (
          <p className={`mt-3 ${KAART} text-smiley-mute`}>Er zijn nog geen eigen berichten.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {lijst.map((b) => {
              const opSite = zichtbaar(b, vandaag);
              return (
                <li key={b.id} className={KAART}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-display text-lg font-bold text-smiley-ink">{b.titel}</p>
                      <p className="text-sm text-smiley-mute">
                        {datumTekst(b.datum)} · laatst bewaard op {moment(b.gewijzigd)}
                        {b.door ? ` door ${b.door}` : ""}
                      </p>
                    </div>
                    <Pil
                      label={b.status === "concept" ? BLOG_STATUS_LABEL.concept : opSite ? "Op de site" : `Ingepland voor ${datumTekst(b.datum)}`}
                      kleur={b.status === "concept" ? "bg-smiley-ink/10 text-smiley-ink" : opSite ? "bg-smiley-mint text-smiley-leaf" : "bg-smiley-sun text-smiley-ink"}
                    />
                  </div>
                  <p className="mt-2 break-words text-sm leading-relaxed text-smiley-ink">{b.samenvatting}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-smiley-ink/10 pt-4">
                    <button
                      type="button"
                      disabled={bezig}
                      onClick={() => {
                        setOpen(b.id);
                        window.scrollTo({ top: 0 });
                      }}
                      className={KNOP_LICHT}
                    >
                      Bewerken
                    </button>
                    {opSite && (
                      <a href={`${BASE}/blog/${b.slug}`} target="_blank" rel="noopener noreferrer" className={KNOP_LICHT}>
                        Bekijk op de site<span className="sr-only"> (opent een nieuw venster)</span>
                      </a>
                    )}
                    {zeker === b.id ? (
                      <>
                        <span className="text-sm font-semibold text-[#8E2A1E]">Dit bericht verwijderen?</span>
                        <button type="button" disabled={bezig} onClick={() => void doe({ actie: "blog-verwijderen", id: b.id }, "Bericht verwijderd.").then(() => setZeker(null))} className={KNOP_ROOD}>
                          Ja, verwijder
                        </button>
                        <button type="button" disabled={bezig} onClick={() => setZeker(null)} className={KNOP_LICHT}>
                          Nee
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={bezig} onClick={() => setZeker(b.id)} className={KNOP_ROOD}>
                        Verwijderen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="sm-blog-vast-kop" className={KAART}>
        <h3 id="sm-blog-vast-kop" className="font-display text-xl font-bold text-smiley-ink">
          Vaste berichten van smileyapp.nl
        </h3>
        <ul className="mt-3 divide-y divide-smiley-ink/10">
          {BLOG.map((b) => (
            <li key={b.slug} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0 break-words font-semibold">{b.titel}</span>
              <span className="shrink-0 text-smiley-mute">{datumTekst(b.datum)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
