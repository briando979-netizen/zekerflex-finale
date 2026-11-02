import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BASE, CONTACT, REVIEWS, THEMAFEESTEN, activiteitenVoor, doelgroep, doelgroepHref } from "@/lib/voorstel/schwarzwald";
import { ActiviteitKaart, Beeld, Sterren } from "@/components/voorstel/SchwarzwaldCards";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = doelgroep((await params).slug);
  return d ? { title: d.naam, description: d.intro } : { title: "Pagina niet gevonden" };
}

export default async function DoelgroepPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = doelgroep((await params).slug);
  if (!d) notFound();
  // doelgroepen met een eigen pagina op hun site tonen die (letterlijke) pagina
  if (d.bron) redirect(doelgroepHref(d));

  const activiteiten = activiteitenVoor(d.slug);
  const review = REVIEWS.find((r) => (d.slug === "trouwen" ? r.bij === "Bruiloft" : r.bij !== "Bruiloft"));

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-14 sm:px-8 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">
              {d.naam}
              {d.nieuw && <span className="ml-3 rounded-full bg-schw-sun px-2.5 py-0.5 text-schw-night">Nieuw</span>}
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[0.95] tracking-[-0.03em]">{d.kop}</h1>
            {d.intro && <p className="mt-6 max-w-xl text-lg leading-relaxed text-schw-cream/80">{d.intro}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`${BASE}/reserveren?voor=${d.slug}`} className="rounded-full bg-schw-orange px-7 py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5">
                Vraag een voorstel aan
              </Link>
              <a href={CONTACT.telefoonHref} className="rounded-full border border-white/20 px-7 py-4 font-semibold hover:bg-white/10">
                Bel {CONTACT.telefoon}
              </a>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] rotate-1 shadow-2xl ring-4 ring-white/10">
            <Image src={d.foto} alt="" fill priority sizes="(max-width: 1024px) 100vw, 600px" className="object-cover" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-14 sm:px-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {d.punten.map((p, i) => (
            <li key={p} className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
              <span className="font-display text-4xl font-bold text-schw-orange">0{i + 1}</span>
              <p className="mt-3 font-semibold leading-snug">{p}</p>
            </li>
          ))}
        </ul>
      </section>

      {activiteiten.length > 0 && (
        <section className="bg-schw-sand py-16">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Populair voor {d.tegel.toLowerCase()}</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activiteiten.slice(0, 6).map((a) => (
                <ActiviteitKaart key={a.slug} a={a} />
              ))}
            </div>
            {activiteiten.length > 6 && (
              <Link href={`${BASE}/activiteiten`} className="mt-8 inline-block font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
                En nog {activiteiten.length - 6} andere activiteiten
              </Link>
            )}
          </div>
        </section>
      )}

      {d.themas && (
        <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Sluit af met een themafeest</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {THEMAFEESTEN.slice(0, 3).map((t) => (
              <Link key={t.slug} href={`${BASE}${t.bron}`} className="group overflow-hidden rounded-xl3 bg-white shadow-[0_18px_40px_-24px_rgba(10,18,14,0.35)]">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Beeld src={t.foto} alt={t.naam} sizes="(max-width: 1024px) 50vw, 400px" className="transition-transform duration-700 ease-spring group-hover:scale-105" />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-xl font-bold">{t.naam}</h3>
                  <p className="mt-1 text-sm text-schw-mute">{t.kort}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {review && (
        <section className="bg-schw-forest py-16 text-schw-cream">
          <figure className="mx-auto max-w-3xl px-4 text-center sm:px-8">
            <Sterren className="text-2xl" />
            <blockquote className="mt-5 font-display text-2xl font-bold leading-snug sm:text-3xl">&ldquo;{review.tekst}&rdquo;</blockquote>
            <figcaption className="mt-5 text-schw-cream/70">
              {review.naam} · {review.bij}
            </figcaption>
          </figure>
        </section>
      )}
    </>
  );
}
