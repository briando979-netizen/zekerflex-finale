import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE, datumTekst } from "@/lib/voorstel/smileyapp";
import { zichtbareBerichten } from "@/lib/voorstel/smileyapp-blog";
import { BlogBeeld } from "@/components/voorstel/smileyapp/BlogBeeld";

// dynamisch: naast de vier berichten van smileyapp.nl ook de berichten die het team in het beheer publiceert
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = (await zichtbareBerichten()).find((x) => x.slug === slug);
  return b ? { title: b.titel, description: b.samenvatting } : {};
}

export default async function SmileyappBlogBericht({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const alle = await zichtbareBerichten();
  const b = alle.find((x) => x.slug === slug);
  if (!b) notFound();
  const andere = alle.filter((x) => x.slug !== b.slug).slice(0, 3);
  return (
    <>
      <article>
        <header className="bg-smiley-ink text-white">
          <div className="mx-auto max-w-[860px] px-4 pb-14 pt-12 sm:px-8 lg:pt-16">
            <Link href={`${BASE}/blog`} className="text-sm font-bold text-smiley-sun hover:underline">
              ← Blog
            </Link>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-white/70">{datumTekst(b.datum)}</p>
            <h1 className="mt-3 font-display text-[clamp(2rem,5.5vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.02em] [hyphens:auto] md:[hyphens:manual]">{b.titel}</h1>
          </div>
        </header>
        <div className="mx-auto -mt-2 max-w-[960px] px-4 sm:px-8">
          <BlogBeeld beeld={b.beeld} priority sizes="(min-width: 960px) 900px, 100vw" className="aspect-[16/7] w-full rounded-[2rem] shadow-[0_30px_80px_-40px_rgba(14,42,32,0.6)]" />
        </div>
        <div className="mx-auto max-w-[720px] px-4 py-14 text-lg leading-relaxed text-smiley-ink sm:px-8">
          {b.inhoud.map((x, i) =>
            x.type === "kop" ? (
              <h2 key={i} className="mt-10 font-display text-2xl font-bold sm:text-3xl">
                {x.tekst}
              </h2>
            ) : x.type === "lijst" ? (
              <ol key={i} className="mt-5 list-decimal space-y-3 pl-6 marker:font-bold marker:text-smiley-leaf">
                {x.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            ) : (
              <p key={i} className="mt-5 whitespace-pre-line break-words">
                {x.tekst}
              </p>
            ),
          )}
          <div className="mt-12 flex flex-wrap gap-3 rounded-[2rem] bg-smiley-mint p-6">
            <p className="w-full font-display text-xl font-bold">Benieuwd hoe het werkt?</p>
            <Link href={`${BASE}#zo-werkt-het`} className="rounded-full bg-smiley-ink px-6 py-3 font-bold text-white">
              Zo werkt Smileyapp
            </Link>
            <Link href={`${BASE}#pakketten`} className="rounded-full px-6 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20">
              Bekijk de pakketten
            </Link>
          </div>
        </div>
      </article>
      <section aria-labelledby="meer-kop" className="bg-white py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <h2 id="meer-kop" className="font-display text-2xl font-bold">
            Meer van de blog
          </h2>
          <ul className="mt-6 grid gap-6 md:grid-cols-3">
            {andere.map((a) => (
              <li key={a.slug}>
                <Link href={`${BASE}/blog/${a.slug}`} className="sm-til group block h-full overflow-hidden rounded-[2rem] bg-smiley-cream ring-1 ring-smiley-ink/5">
                  <BlogBeeld beeld={a.beeld} sizes="(min-width: 768px) 380px, 100vw" className="aspect-[16/9] w-full" />
                  <p className="p-5 font-display text-lg font-bold leading-tight">{a.titel}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
