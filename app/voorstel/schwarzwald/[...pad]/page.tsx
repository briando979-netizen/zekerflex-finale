import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE, DOELGROEPEN, activiteitenVoor } from "@/lib/voorstel/schwarzwald";
import { paginaVoorSite } from "@/lib/voorstel/schwarzwald-cms";
import { huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { OPEN_SOLLICITATIE, isVacaturePad } from "@/lib/voorstel/sollicitatie-regels";
import { SchwarzwaldBlokken } from "@/components/voorstel/SchwarzwaldBlokken";
import { ActiviteitKaart, CtaBand } from "@/components/voorstel/SchwarzwaldCards";
import { Solliciteren } from "@/components/voorstel/Solliciteren";

// Alle overige pagina's uit hun menu (bedrijfsfeest, trouwen, restaurant,
// vacatures, contact, …) met hun eigen tekst. Het pad is gelijk aan hun pad,
// dus /voorstel/schwarzwald/restaurant/bbq = hetschwarzwald.nl/restaurant/bbq.

type Props = { params: Promise<{ pad: string[] }> };

const sleutel = (pad: string[]) => `/${pad.join("/")}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await paginaVoorSite(sleutel((await params).pad));
  return p ? { title: p.titel } : { title: "Pagina niet gevonden" };
}

export default async function SchwarzwaldPagina({ params }: Props) {
  const key = sleutel((await params).pad);
  const p = await paginaVoorSite(key);
  if (!p) notFound();

  const doelgroep = DOELGROEPEN.find((d) => d.bron === key);
  const populair = doelgroep ? activiteitenVoor(doelgroep.slug).slice(0, 6) : [];
  const vacature = isVacaturePad(key);
  const account = vacature ? await huidigAccount().catch(() => null) : null;

  return (
    <>
      <section className="relative isolate overflow-hidden bg-schw-night text-schw-cream">
        {p.hero ? (
          <>
            <Image src={p.hero} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-50" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-schw-night via-schw-night/50 to-schw-night/10" />
          </>
        ) : (
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-schw-orange/25 blur-3xl" />
        )}
        <div className={`mx-auto max-w-[1280px] px-4 pb-14 sm:px-8 ${p.hero ? "pt-36 lg:pt-48" : "pt-14 lg:pt-20"}`}>
          <nav aria-label="Kruimelpad" className="text-sm text-schw-cream/70">
            <Link href={BASE} className="hover:text-schw-cream">Home</Link>
            <span aria-hidden="true"> / </span>
            <span>{p.titel}</span>
          </nav>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.6rem,7vw,5.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">
            {p.heroKop || p.titel}
          </h1>
          {p.heroKop && p.heroKop !== p.titel && <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">{p.titel}</p>}
        </div>
      </section>

      {doelgroep && (
        <section className="mx-auto max-w-[1280px] px-4 pt-10 sm:px-8">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {doelgroep.punten.map((punt) => (
              <li key={punt} className="rounded-2xl bg-white p-4 text-sm font-semibold shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
                {punt}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="py-14">
        <SchwarzwaldBlokken blokken={p.blokken} />
      </div>

      {vacature && (
        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-8">
          <Solliciteren
            vacature={key}
            functie={key === "/vacatures" ? OPEN_SOLLICITATIE : p.titel}
            gegevens={account ? { naam: account.naam, email: account.email, telefoon: account.telefoon } : null}
          />
        </section>
      )}

      {populair.length > 0 && doelgroep && (
        <section className="bg-schw-sand py-16">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Populair voor {doelgroep.tegel.toLowerCase()}</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {populair.map((a) => (
                <ActiviteitKaart key={a.slug} a={a} />
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  );
}
