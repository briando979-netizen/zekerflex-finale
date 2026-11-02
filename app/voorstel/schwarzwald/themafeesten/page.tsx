import type { Metadata } from "next";
import Link from "next/link";
import { BASE, THEMAFEESTEN } from "@/lib/voorstel/schwarzwald";
import { Beeld } from "@/components/voorstel/SchwarzwaldCards";

export const metadata: Metadata = { title: "Themafeesten" };

export default function ThemafeestenPage() {
  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Themafeesten</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.8rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.03em]">
            Jullie zaal, ons <span className="text-schw-orange">thema</span>, één groot feest.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-schw-cream/80">
            Met DJ, presentator en aangeklede zaal. Ideaal als afsluiter van een bedrijfsfeest of jubileum.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] space-y-8 px-4 py-14 sm:px-8">
        {THEMAFEESTEN.map((t, i) => (
          <article
            key={t.slug}
            id={t.slug}
            className="grid scroll-mt-24 overflow-hidden rounded-xl3 bg-white shadow-[0_18px_40px_-24px_rgba(10,18,14,0.35)] md:grid-cols-2"
          >
            <div className={`relative aspect-[16/10] md:aspect-auto md:min-h-[320px] ${i % 2 === 1 ? "md:order-2" : ""}`}>
              <Beeld src={t.foto} alt={t.naam} sizes="(max-width: 768px) 100vw, 640px" />
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-schw-orange">{t.kort}</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{t.naam}</h2>
              <p className="mt-4 text-lg leading-relaxed text-schw-mute">{t.tekst}</p>
              {t.prijs && <p className="mt-4 font-bold">{t.prijs}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href={`${BASE}${t.bron}`} className="rounded-full bg-schw-night px-6 py-3 text-sm font-bold text-schw-cream transition-transform hover:-translate-y-0.5">
                  Alles over dit feest
                </Link>
                <Link href={`${BASE}/reserveren?thema=${t.slug}`} className="text-sm font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
                  Vraag dit feest aan
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
