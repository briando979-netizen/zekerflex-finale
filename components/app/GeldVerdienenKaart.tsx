import Link from "next/link";

/**
 * De turquoise kaart bovenaan Ontdekken (naar de app van YoungOnes, 21 nov 2026): "Geld verdienen? Om op klussen te
 * reageren moet je eerst je profiel compleet maken → Ga door met je profiel", of later "Regel je verificatie → Regel het
 * nu". De stappen zelf staan op /dashboard/start/profiel. Vaste kleuren: dezelfde kaart in het lichte en het donkere thema.
 */
export function GeldVerdienenKaart({ kop, tekst, knop, href }: { kop: string; tekst: string; knop: string; href: string }) {
  return (
    <section className="mb-5 rounded-xl bg-[#14D9C9] px-5 py-6 text-center text-[#0B1238]" aria-labelledby="geld-verdienen-kop">
      <h2 id="geld-verdienen-kop" className="font-display text-xl font-extrabold">{kop}</h2>
      <p className="mx-auto mt-2 max-w-sm text-base leading-snug">{tekst}</p>
      <Link href={href} className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-lg bg-[#121418] px-4 text-base font-bold text-white transition hover:bg-[#1C1F26]">
        {knop}
      </Link>
    </section>
  );
}
