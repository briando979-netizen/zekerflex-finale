import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { paginaVoorSite } from "@/lib/voorstel/schwarzwald-cms";
import { zichtbareBerichten } from "@/lib/voorstel/schwarzwald-nieuws";
import { SchwarzwaldBlokken } from "@/components/voorstel/SchwarzwaldBlokken";
import { CtaBand } from "@/components/voorstel/SchwarzwaldCards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuws" };

// Nieuws: de berichten die het team schrijft in Beheer → Nieuws. Titel en de
// tekst bij "nog geen berichten" komen uit het pagina-CMS (/nieuws).

const datumNL = (d: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function NieuwsPage() {
  const [pagina, berichten] = await Promise.all([paginaVoorSite("/nieuws"), zichtbareBerichten()]);
  return (
    <>
      <section className="relative isolate overflow-hidden bg-schw-night text-schw-cream">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-schw-orange/25 blur-3xl" />
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <nav aria-label="Kruimelpad" className="text-sm text-schw-cream/70">
            <Link href={BASE} className="hover:text-schw-cream">
              Home
            </Link>
            <span aria-hidden="true"> / </span>
            <span>Nieuws</span>
          </nav>
          <h1 className="mt-4 font-display text-[clamp(2.6rem,7vw,5.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">{pagina?.heroKop || pagina?.titel || "Nieuws"}</h1>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-14 sm:px-8">
        {berichten.length === 0 ? (
          pagina ? <SchwarzwaldBlokken blokken={pagina.blokken} /> : <p className="text-schw-mute">Er zijn nog geen berichten.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {berichten.map((b) => (
              <li key={b.id}>
                <Link href={`${BASE}/nieuws/${b.slug}`} className="group flex h-full flex-col overflow-hidden rounded-xl3 bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06)] hover:ring-2 hover:ring-schw-orange">
                  {b.foto && (
                    <span className="relative block aspect-[16/10] overflow-hidden">
                      <Image src={b.foto} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    </span>
                  )}
                  <span className="flex flex-1 flex-col p-6">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-schw-rust">{datumNL(b.datum)}</span>
                    <span className="mt-2 font-display text-2xl font-bold leading-tight">{b.titel}</span>
                    {b.samenvatting && <span className="mt-2 text-schw-night/80">{b.samenvatting}</span>}
                    <span className="mt-auto pt-4 font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">Lees meer</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CtaBand />
    </>
  );
}
