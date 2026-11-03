import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTIVITEITEN, BASE, CONTACT, DOELGROEPEN, activiteit, doelgroepHref } from "@/lib/voorstel/schwarzwald";
import { paginaVoorSite } from "@/lib/voorstel/schwarzwald-cms";
import { SchwarzwaldBlokken } from "@/components/voorstel/SchwarzwaldBlokken";
import { ActiviteitKaart, Beeld, CtaBand } from "@/components/voorstel/SchwarzwaldCards";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = activiteit((await params).slug);
  return a ? { title: a.naam, description: a.kort } : { title: "Activiteit niet gevonden" };
}

export default async function ActiviteitPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = activiteit((await params).slug);
  if (!a) notFound();

  // hun eigen tekst over deze activiteit, letterlijk
  const bron = await paginaVoorSite(a.bron);
  const ookLeuk = ACTIVITEITEN.filter((x) => x.slug !== a.slug && x.categorie === a.categorie).slice(0, 3);
  const doelgroepen = DOELGROEPEN.filter((d) => a.voor.includes(d.slug));

  return (
    <>
      <section className="relative isolate overflow-hidden bg-schw-night text-schw-cream">
        <div className="absolute inset-0 -z-10 opacity-60">
          <Beeld src={a.foto} alt={a.naam} sizes="100vw" priority />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-schw-night via-schw-night/60 to-schw-night/10" />
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-40 sm:px-8 lg:pt-56">
          <Link href={`${BASE}/activiteiten`} className="text-sm font-semibold text-schw-cream/80 hover:text-schw-cream">
            ← Alle activiteiten
          </Link>
          <h1 className="mt-4 font-display text-[clamp(3rem,9vw,6.5rem)] font-bold leading-[0.9] tracking-[-0.03em]">{a.naam}</h1>
          {bron?.heroKop && <p className="mt-4 max-w-xl text-xl text-schw-cream/85">{bron.heroKop}</p>}
          <dl className="mt-8 flex flex-wrap gap-3">
            {(
              [
                ["Prijs", a.prijs],
                ["Duur", a.duur],
                ["Groep", a.groep],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/10 px-5 py-3 ring-1 ring-white/15 backdrop-blur">
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-schw-sun">{k}</dt>
                <dd className="mt-0.5 font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 pt-10 sm:px-8">
        <Link
          href={`${BASE}/reserveren?activiteit=${a.slug}`}
          className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night transition-transform hover:-translate-y-0.5"
        >
          Reserveer {a.naam.toLowerCase()}
        </Link>
        <a href={CONTACT.telefoonHref} className="text-sm font-semibold text-schw-mute hover:text-schw-night">
          of bel {CONTACT.telefoon}
        </a>
        {doelgroepen.length > 0 && (
          <div className="flex w-full flex-wrap gap-2 pt-2">
            <span className="py-2 text-sm font-semibold text-schw-mute">Populair bij</span>
            {doelgroepen.map((d) => (
              <Link key={d.slug} href={doelgroepHref(d)} className="rounded-full bg-schw-sand px-4 py-2 text-sm font-semibold hover:bg-schw-sun">
                {d.naam}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="py-12">
        {bron ? (
          <SchwarzwaldBlokken blokken={bron.blokken} />
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2 px-4 text-lg sm:px-8">
            {a.feiten.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>

      {ookLeuk.length > 0 && (
        <section className="bg-schw-sand py-16">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Ook leuk</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ookLeuk.map((x) => (
                <ActiviteitKaart key={x.slug} a={x} />
              ))}
            </div>
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}
