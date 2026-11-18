import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BASE, BLOG, datumTekst } from "@/lib/voorstel/smileyapp";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

export const metadata: Metadata = { title: "Blog" };

export default function SmileyappBlog() {
  const [eerste, ...rest] = BLOG;
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-20 sm:right-10" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Blog</p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.2rem,6vw,4rem)] font-bold leading-[1.02] tracking-[-0.02em]">Klanttevredenheid, gastvrijheid en de NPS-score</h1>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
        {eerste && (
          <Link href={`${BASE}/blog/${eerste.slug}`} className="sm-onthul group grid overflow-hidden rounded-[2rem] bg-white ring-1 ring-smiley-ink/10 lg:grid-cols-[1.3fr_1fr]">
            <Image src={eerste.beeld} alt="" width={eerste.breed} height={eerste.hoog} priority sizes="(min-width: 1024px) 660px, 100vw" className="aspect-[16/9] h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <p className="text-xs font-bold uppercase tracking-wider text-smiley-leaf">{datumTekst(eerste.datum)}</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight">{eerste.titel}</h2>
              <p className="mt-3 leading-relaxed text-smiley-mute">{eerste.samenvatting}</p>
              <span className="mt-6 font-bold text-smiley-leaf">Lees verder →</span>
            </div>
          </Link>
        )}
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {rest.map((b) => (
            <li key={b.slug} className="sm-onthul">
              <Link href={`${BASE}/blog/${b.slug}`} className="sm-til group block h-full overflow-hidden rounded-[2rem] bg-white ring-1 ring-smiley-ink/10">
                <Image src={b.beeld} alt="" width={b.breed} height={b.hoog} sizes="(min-width: 768px) 380px, 100vw" className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-smiley-leaf">{datumTekst(b.datum)}</p>
                  <h2 className="mt-2 font-display text-xl font-bold leading-tight">{b.titel}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-smiley-mute">{b.samenvatting}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
