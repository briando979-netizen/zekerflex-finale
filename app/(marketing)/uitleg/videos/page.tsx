import type { Metadata } from "next";
import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { RECLAME_VIDEOS } from "@/components/marketing/ReclameVideoBlok";
import { UITLEG_VIDEOS } from "@/lib/marketing/uitleg-videos";
import { VIDEOKAMER, duurTekst, paginaVideo, posterPad, videoPad, type PaginaVideo } from "@/lib/marketing/paginavideos";
import { SITE, breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

// De videokamer (21 nov 2026, eigenaar: "alle uitlegvideo's in een aparte ruimte bij Uitleg, bekijk alle video's"). De korte
// uitlegvideo's staan niet meer midden op de pagina's (voor-freelancers, voor-bedrijven, prijzen, horeca), maar hier bij elkaar:
// de filmpjes van /uitleg, de paginavideo's (lib/marketing/paginavideos.ts, VIDEOKAMER) en de twee reclamefilmpjes. Een video
// zonder bestand staat er niet; nergens "komt binnenkort". Video's laden pas bij afspelen (preload="none").
export const dynamic = "force-dynamic";

const title = "Alle video's van ZekerFlex";
const description = "Alle uitlegvideo's van ZekerFlex op één plek: wat ZekerFlex is, een klus plaatsen, uitzenden of freelance, uren goedkeuren, de kosten en meer.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical("/uitleg/videos", { title, description }),
};

const bestaat = (pad: string) => existsSync(join(process.cwd(), "public", pad.replace(/^\//, "")));

function Speler({ src, poster, titel, tekst, duur }: { src: string; poster: string; titel: string; tekst: string; duur: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video controls preload="none" poster={poster} className="aspect-video w-full bg-ink" src={src} />
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{duur}</p>
        <h3 className="mt-1 font-display text-lg font-bold text-ink">{titel}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{tekst}</p>
      </div>
    </article>
  );
}

export default function VideokamerPage() {
  const uitleg = UITLEG_VIDEOS.filter((v) => bestaat(`/videos/${v.slug}.mp4`));
  const paginas = VIDEOKAMER.map((id) => paginaVideo(id)).filter((v): v is PaginaVideo => v !== undefined && bestaat(videoPad(v)));
  const reclame = (Object.keys(RECLAME_VIDEOS) as (keyof typeof RECLAME_VIDEOS)[]).filter((s) => bestaat(`/videos/reclame/${s}.mp4`));
  const ld = paginas.map((v) => ({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.titel,
    description: v.samenvatting,
    thumbnailUrl: `${SITE.url}${posterPad(v)}`,
    contentUrl: `${SITE.url}${videoPad(v)}`,
    uploadDate: "2026-11-16",
    duration: `PT${v.seconden}S`,
    inLanguage: "nl",
  }));
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Uitleg", "/uitleg"], ["Alle video's", "/uitleg/videos"]]), ...ld]) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/uitleg" className="text-sm font-semibold text-white/70 hover:text-white">
            ← Uitleg
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">Videokamer</p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight md:text-5xl">Alle video&apos;s van ZekerFlex</h1>
          <p className="mt-4 max-w-xl text-white/70">Korte filmpjes over hoe ZekerFlex werkt, voor werkers en voor bedrijven. Bekijk ze wanneer het jou uitkomt.</p>
        </div>
      </div>

      {uitleg.length > 0 && (
        <Section tone="paper">
          <SectionHead eyebrow="Stap voor stap" title="Zo werkt ZekerFlex" />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {uitleg.map((v) => (
              <Speler key={v.slug} src={`/videos/${v.slug}.mp4`} poster={`/videos/${v.slug}.jpg`} titel={v.title} tekst={v.body} duur={v.duration} />
            ))}
          </div>
        </Section>
      )}

      {paginas.length > 0 && (
        <Section tone="soft">
          <SectionHead eyebrow="In een halve minuut" title="Korte uitleg per onderwerp" />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {paginas.map((v) => (
              <Speler key={v.slug} src={videoPad(v)} poster={posterPad(v)} titel={v.titel} tekst={v.samenvatting} duur={duurTekst(v.seconden)} />
            ))}
          </div>
        </Section>
      )}

      {reclame.length > 0 && (
        <Section tone="paper">
          <SectionHead eyebrow="Zonder geluid" title="Onze reclamefilmpjes" />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {reclame.map((s) => (
              <Speler
                key={s}
                src={`/videos/reclame/${s}.mp4`}
                poster={`/videos/reclame/${s}.jpg`}
                titel={RECLAME_VIDEOS[s].kop}
                tekst={RECLAME_VIDEOS[s].tekst}
                duur={duurTekst(RECLAME_VIDEOS[s].seconden)}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
