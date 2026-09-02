import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WHITEPAPERS, whitepaperBySlug } from "@/lib/kennis/whitepapers";

export function generateStaticParams() {
  return WHITEPAPERS.map((w) => ({ slug: w.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const w = whitepaperBySlug(params.slug);
  if (!w) return { title: "Whitepaper" };
  return { title: `${w.title} — whitepaper`, description: w.intro };
}

function nlDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function WhitepaperReaderPage({ params }: { params: { slug: string } }) {
  const wp = whitepaperBySlug(params.slug);
  if (!wp) notFound();

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/kennis/whitepapers" className="text-sm font-medium text-white/60 hover:text-white">
            ← Whitepapers
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">{wp.category}</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">
            {wp.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">{wp.subtitle}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={`/api/kennis/whitepaper/${wp.slug}`} className="btn-mint">
              Download als PDF
            </a>
            <span className="font-mono text-xs uppercase tracking-wide text-white/40">
              {wp.readMinutes} min lezen · bijgewerkt {nlDate(wp.updated)}
            </span>
          </div>
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          <p className="text-[1.05rem] font-medium leading-relaxed text-ink">{wp.intro}</p>

          {wp.sections.map((s, si) => (
            <section key={si} className="mt-12 first:mt-10">
              <h2 className="font-display text-xl font-bold text-ink md:text-2xl">{s.heading}</h2>
              {s.blocks.map((b, bi) => {
                if (b.t === "p")
                  return (
                    <p key={bi} className="mt-4 text-[1.02rem] leading-relaxed text-neutralx-700">
                      {b.text}
                    </p>
                  );
                if (b.t === "h3")
                  return (
                    <h3 key={bi} className="mt-6 font-display text-lg font-semibold text-ink">
                      {b.text}
                    </h3>
                  );
                if (b.t === "note")
                  return (
                    <p
                      key={bi}
                      className="mt-5 rounded-xl border-l-4 border-brand-mint bg-mintwash px-4 py-3 text-[0.97rem] leading-relaxed text-brand-700"
                    >
                      <strong className="font-semibold">Let op:</strong> {b.text}
                    </p>
                  );
                return (
                  <ul key={bi} className="mt-4 space-y-2">
                    {b.items.map((it, ii) => (
                      <li key={ii} className="flex gap-3 text-[1.02rem] leading-relaxed text-neutralx-700">
                        <span className="mt-1 text-brand-mint">→</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                );
              })}
            </section>
          ))}

          <div className="mt-14 flex flex-wrap gap-3 border-t border-hair pt-8">
            <a href={`/api/kennis/whitepaper/${wp.slug}`} className="btn-primary">
              Download als PDF
            </a>
            <Link href="/kennis/whitepapers" className="btn-ghost">
              Alle whitepapers
            </Link>
          </div>

          <p className="mt-8 text-sm text-neutralx-500">
            Algemene informatie, geen fiscaal of juridisch advies. Bedragen en regels kunnen wijzigen — raadpleeg
            bij twijfel de Belastingdienst of een adviseur.
          </p>
        </div>
      </article>
    </>
  );
}
