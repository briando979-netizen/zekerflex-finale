import type { Metadata } from "next";
import Link from "next/link";
import { POSTS, nlDate } from "@/lib/kennis/content";

export const metadata: Metadata = {
  title: "Blog",
  description: "Nieuws en achtergrond over flexibel werken, de Wet DBA en het ZekerFlex-platform.",
};

export default function BlogIndexPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <Link href="/kennis" className="text-sm font-medium text-white/60 hover:text-white">
            ← Kennis
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">Blog</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Nieuws en achtergrond
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            Wat er speelt in flexibel werk, en hoe wij daar het platform op aanpassen.
          </p>
        </div>
      </div>

      <section className="bg-paper">
        <div className="shell py-16 md:py-20">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {POSTS.map((p) => (
              <Link
                key={p.slug}
                href={`/kennis/blog/${p.slug}`}
                className="group flex flex-col rounded-2xl border border-hair bg-paper p-6 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
              >
                <span className="font-mono text-xs uppercase tracking-wide text-neutralx-400">
                  {nlDate(p.date)} · {p.author}
                </span>
                <h2 className="mt-2 font-display text-lg font-semibold text-ink">{p.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{p.excerpt}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                  Lezen · {p.readMinutes} min
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
