import type { Metadata } from "next";
import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { CopyLinkButton } from "@/components/marketing/CopyLinkButton";
import { FotoKolom } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
import { UITLEG_VIDEOS } from "@/lib/marketing/uitleg-videos";

// De filmpjes staan als bestand in /public/videos (in git, ±1 MB per stuk, gemaakt met scripts/uitleg-videos/: echte schermen met
// onze eigen stem). Een video zonder bestand wordt niet getoond; er staat nergens "komt binnenkort".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Uitleg in het kort — ZekerFlex",
  description:
    "Korte uitlegfilmpjes over ZekerFlex: wat het is, hoe je een klus plaatst, het verschil tussen uitzenden en freelance, uren goedkeuren en de kosten.",
  alternates: { canonical: "/uitleg" },
};

// de lijst staat in lib/marketing/uitleg-videos.ts (ook voor de videokamer /uitleg/videos)
const VIDEOS = UITLEG_VIDEOS;

function videoReady(slug: string): boolean {
  return existsSync(join(process.cwd(), "public", "videos", `${slug}.mp4`));
}

export default function UitlegPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-10 py-16 md:py-20 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
          <p className="eyebrow text-brand-mint">In het kort</p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight md:text-5xl">
            ZekerFlex uitgelegd in korte filmpjes
          </h1>
          <p className="mt-4 max-w-xl text-white/70">
            Handig om te bekijken vóór je begint — of om te laten zien tijdens een gesprek met een
            opdrachtgever.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/uitleg/videos" className="btn-mint">
              Bekijk alle video&apos;s
            </Link>
            <CopyLinkButton path="/uitleg" />
          </div>
          </div>
          <FotoKolom foto={paginaFoto("uitleg")} />
        </div>
      </div>

      {videoReady("zekerflex-uitleg-compleet") && (
        <Section tone="paper">
          <SectionHead
            eyebrow="De volledige uitleg"
            title="ZekerFlex in één film — ruim 3,5 minuut"
          />
          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              preload="metadata"
              poster="/videos/zekerflex-uitleg-compleet.jpg"
              className="aspect-video w-full bg-ink"
              src="/videos/zekerflex-uitleg-compleet.mp4"
            />
            <p className="p-5 text-sm leading-relaxed text-neutralx-600">
              Alle vijf de onderdelen achter elkaar: wat ZekerFlex is, een klus plaatsen, uitzenden
              of freelance, uren goedkeuren en de kosten. Met Nederlandse voice-over.
            </p>
          </div>
        </Section>
      )}

      <Section tone="paper">
        <SectionHead eyebrow="Per onderwerp" title="Of bekijk losse filmpjes" />
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {VIDEOS.filter((v) => videoReady(v.slug)).map((v) => {
            return (
              <article key={v.slug} id={v.slug} className="scroll-mt-24">
                <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    controls
                    preload="metadata"
                    poster={`/videos/${v.slug}.jpg`}
                    className="aspect-video w-full bg-ink"
                    src={`/videos/${v.slug}.mp4`}
                  />
                  <div className="p-5">
                    <h2 className="font-display text-lg font-bold text-ink">{v.title}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{v.body}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link href="/uitleg/videos" className="btn-primary">
            Bekijk alle video&apos;s
          </Link>
        </div>

        <div className="mt-14 rounded-2xl border border-hair bg-white p-6 text-center">
          <p className="font-display text-lg font-bold text-ink">Meer weten?</p>
          <p className="mt-1 text-sm text-neutralx-600">
            Bekijk het volledige{" "}
            <Link href="/kennis" className="font-semibold text-brand-600 underline">
              helpcentrum
            </Link>{" "}
            of{" "}
            <Link href="/demo" className="font-semibold text-brand-600 underline">
              vraag een demo aan
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
