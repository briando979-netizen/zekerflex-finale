import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTIVITEITEN, BASE, CONTACT, DOELGROEPEN, activiteit } from "@/lib/voorstel/schwarzwald";
import { ActiviteitKaart, ArrangementBlok, Beeld } from "@/components/voorstel/SchwarzwaldCards";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = activiteit((await params).slug);
  return a ? { title: a.naam, description: a.kort } : { title: "Activiteit niet gevonden" };
}

export default async function ActiviteitPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = activiteit((await params).slug);
  if (!a) notFound();

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
          <p className="mt-4 max-w-xl text-xl text-schw-cream/85">{a.kort}</p>
          <dl className="mt-8 flex flex-wrap gap-3">
            {[
              ["Prijs", a.prijs],
              ["Duur", a.duur],
              ["Groep", a.groep],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/10 px-5 py-3 ring-1 ring-white/15 backdrop-blur">
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-schw-sun">{k}</dt>
                <dd className="mt-0.5 font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-2xl leading-relaxed text-schw-night">{a.intro}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {a.feiten.map((f) => (
              <li key={f} className="flex gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
                <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-schw-orange text-xs font-bold text-schw-night">
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {doelgroepen.length > 0 && (
            <div className="mt-10">
              <p className="text-sm font-semibold text-schw-mute">Populair bij</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {doelgroepen.map((d) => (
                  <Link key={d.slug} href={`${BASE}/voor/${d.slug}`} className="rounded-full bg-schw-sand px-4 py-2 text-sm font-semibold hover:bg-schw-sun">
                    {d.naam}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          {a.arrangement ? (
            <ArrangementBlok titel="Trending arrangement" stappen={a.arrangement.stappen} prijs={a.arrangement.prijs} />
          ) : (
            <div className="rounded-xl3 bg-schw-night p-6 text-schw-cream sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Maak er een dag van</p>
              <p className="mt-4 text-lg">Combineer {a.naam.toLowerCase()} met een BBQ, bourgondische hittesteen of buffet. Wij stellen het programma samen.</p>
            </div>
          )}
          <Link href={`${BASE}/reserveren?activiteit=${a.slug}`} className="block rounded-full bg-schw-orange py-4 text-center font-bold text-schw-night transition-transform hover:-translate-y-0.5">
            Reserveer {a.naam.toLowerCase()}
          </Link>
          <a href={CONTACT.telefoonHref} className="block text-center text-sm font-semibold text-schw-mute hover:text-schw-night">
            Liever bellen? {CONTACT.telefoon}
          </a>
        </aside>
      </section>

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
    </>
  );
}
