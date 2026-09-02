import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guideBySlug, nlDate } from "@/lib/kennis/content";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const g = guideBySlug(params.slug);
  if (!g) return { title: "Kennisbank" };
  return { title: g.title, description: g.excerpt };
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const g = guideBySlug(params.slug);
  if (!g) notFound();

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/kennis#kennisbank" className="text-sm font-medium text-white/60 hover:text-white">
            ← Kennisbank
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">{g.category}</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">
            {g.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">{g.excerpt}</p>
          <p className="mt-6 font-mono text-xs uppercase tracking-wide text-white/40">
            {g.readMinutes} min lezen · bijgewerkt {nlDate(g.updated)}
          </p>
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          {g.body.map((block) => (
            <section key={block.heading} className="mt-10 first:mt-0">
              <h2 className="font-display text-xl font-bold text-ink md:text-2xl">{block.heading}</h2>
              {block.paragraphs.map((p, i) => (
                <p key={i} className="mt-4 text-[1.02rem] leading-relaxed text-neutralx-700">
                  {p}
                </p>
              ))}
            </section>
          ))}

          <div className="mt-14 flex flex-wrap gap-3 border-t border-hair pt-8">
            <Link href="/register" className="btn-primary">
              Account aanmaken
            </Link>
            <Link href="/kennis/faq" className="btn-ghost">
              Veelgestelde vragen
            </Link>
          </div>
        </div>
      </article>

      <section className="bg-paper-soft">
        <div className="shell py-16">
          <h2 className="font-display text-xl font-bold text-ink">Meer uit de kennisbank</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {GUIDES.filter((x) => x.slug !== g.slug)
              .slice(0, 3)
              .map((x) => (
                <Link
                  key={x.slug}
                  href={`/kennis/${x.slug}`}
                  className="group rounded-2xl border border-hair bg-paper p-5 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
                >
                  <span className="pill w-fit bg-mintwash text-brand-600">{x.category}</span>
                  <h3 className="mt-2 font-display text-base font-semibold text-ink">{x.title}</h3>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    Lezen
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </Link>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}
