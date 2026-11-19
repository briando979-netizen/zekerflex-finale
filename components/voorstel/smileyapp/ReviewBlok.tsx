import { sterren } from "@/lib/voorstel/review-weergave";
import { REVIEWS_NL, bronLinkTekst, bronTekst, reviewDatum, samenvattingTekst, sterrenBreedte, sterrenTekst, type ReviewTaal } from "@/lib/voorstel/smileyapp-review-regels";
import { reviewsVoorSite } from "@/lib/voorstel/smileyapp-reviews";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { Kopje } from "@/components/voorstel/smileyapp/Blokken";

// "Wat klanten zeggen": de reviews die het SmileyApp-team zelf in het beheer
// heeft overgenomen, met het gemiddelde en hooguit zes kaarten. Server-onderdeel
// dat zijn eigen gegevens haalt, zodat de pagina's er alleen een regel voor
// nodig hebben. Zonder zichtbare review geeft het niets terug: geen kop, geen
// lege sterren en geen voorbeeld. De sterren zijn versiering (aria-hidden); het
// cijfer staat er als gewone tekst naast. Bewust geen Review- of
// AggregateRating-gegevens voor zoekmachines: dit is een ontwerpvoorstel.

export async function ReviewBlok({ taal = "nl" }: { taal?: ReviewTaal }) {
  const overzicht = await reviewsVoorSite();
  // geen zichtbare review: het blok bestaat niet
  if (!overzicht) return null;
  const t = taal === "nl" ? REVIEWS_NL : TEKSTEN[taal].reviews;
  return (
    <section id="reviews" aria-labelledby="reviews-kop" className="scroll-mt-24 bg-smiley-mint py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Kopje boven={t.boven} kop={t.kop} id="reviews-kop" />
          <p className="sm-onthul flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl bg-smiley-ink px-5 py-4 text-white">
            <span aria-hidden="true" className="relative inline-block whitespace-nowrap text-2xl leading-none text-white/25">
              ★★★★★
              <span className="absolute inset-y-0 left-0 overflow-hidden text-smiley-sun" style={{ width: `${sterrenBreedte(overzicht.gemiddelde)}%` }}>
                ★★★★★
              </span>
            </span>
            <span className="font-bold">{samenvattingTekst(overzicht, t, taal)}</span>
          </p>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {overzicht.getoond.map((r) => (
            <li key={r.id} className="sm-onthul relative">
              <figure className="flex h-full flex-col rounded-[2rem] bg-white p-7 ring-1 ring-smiley-ink/10">
                <p className="font-bold text-smiley-ink">
                  <span aria-hidden="true" className="text-xl leading-none">
                    {sterren(r.sterren)}
                  </span>
                  <span className="sr-only">{sterrenTekst(r.sterren, t)}</span>
                </p>
                <blockquote className="mt-4 whitespace-pre-line break-words leading-relaxed text-smiley-ink">{r.tekst}</blockquote>
                <figcaption className="mt-auto pt-6">
                  <span className="block break-words font-bold text-smiley-ink">{r.naam}</span>
                  {r.organisatie && <span className="block break-words text-sm text-smiley-mute">{r.organisatie}</span>}
                  <span className="mt-2 block text-sm text-smiley-mute">
                    {r.datum ? `${reviewDatum(r.datum, taal)} · ` : ""}
                    {bronTekst(r.bron, t)}
                  </span>
                  {r.bronLink && (
                    <a href={r.bronLink} target="_blank" rel="noopener nofollow" className="mt-2 inline-block text-sm font-semibold text-smiley-leaf underline underline-offset-2">
                      {bronLinkTekst(r.bron, t)}
                      <span className="sr-only">
                        , {r.naam} {t.nieuwVenster}
                      </span>
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  )}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-smiley-ink/80">{t.voet}</p>
      </div>
    </section>
  );
}
