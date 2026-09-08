import type { Metadata } from "next";
import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { CopyLinkButton } from "@/components/marketing/CopyLinkButton";

// De filmpjes staan als bestand in /public/videos; force-dynamic zodat een
// nieuw .mp4 meteen zichtbaar is zonder rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Uitleg in het kort — ZekerFlex",
  description:
    "Korte uitlegfilmpjes over ZekerFlex: wat het is, hoe je een klus plaatst, het verschil tussen uitzenden en freelance, uren goedkeuren en de kosten.",
  alternates: { canonical: "/uitleg" },
};

const VIDEOS = [
  {
    slug: "wat-is-zekerflex",
    title: "Wat is ZekerFlex?",
    duration: "1 min",
    body: "Eén platform voor freelance- én uitzendkrachten. Geen bureau ertussen, alles digitaal geregeld.",
  },
  {
    slug: "klus-plaatsen",
    title: "Zo plaats je een klus",
    duration: "2 min",
    body: "Van functie en tarief tot bevestigde kracht — je zet een klus in een paar minuten live.",
  },
  {
    slug: "uitzenden-of-freelance",
    title: "Uitzenden of freelance — het verschil",
    duration: "2 min",
    body: "Loonstrook, vakantiegeld en pensioen via het uitzendbureau, of een ZZP'er met eigen factuur. Jij kiest per klus.",
  },
  {
    slug: "uren-goedkeuren",
    title: "Uren goedkeuren in 30 seconden",
    duration: "1 min",
    body: "GPS-check-in, ingevulde uren, één tik akkoord. Daarna loopt facturatie of verloning automatisch.",
  },
  {
    slug: "kosten-en-facturen",
    title: "Wat kost het en hoe zit het met facturen?",
    duration: "2 min",
    body: "€ 3,50 per gewerkt uur, één heldere factuur. Bij uitzenden zit de cao-beloning en payroll erbij in.",
  },
];

function videoReady(slug: string): boolean {
  return existsSync(join(process.cwd(), "public", "videos", `${slug}.mp4`));
}

export default function UitlegPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">In het kort</p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight md:text-5xl">
            ZekerFlex uitgelegd in korte filmpjes
          </h1>
          <p className="mt-4 max-w-xl text-white/70">
            Handig om te bekijken vóór je begint — of om te laten zien tijdens een gesprek met een
            opdrachtgever.
          </p>
          <div className="mt-6">
            <CopyLinkButton path="/uitleg" />
          </div>
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
          {VIDEOS.map((v) => {
            const ready = videoReady(v.slug);
            return (
              <article key={v.slug} id={v.slug} className="scroll-mt-24">
                <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
                  {ready ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      controls
                      preload="metadata"
                      poster={`/videos/${v.slug}.jpg`}
                      className="aspect-video w-full bg-ink"
                      src={`/videos/${v.slug}.mp4`}
                    />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center bg-gradient-to-br from-ink to-brand-700 text-center text-white">
                      <div>
                        <span className="text-3xl">▶</span>
                        <p className="mt-2 text-sm font-semibold">Video komt binnenkort</p>
                        <p className="mt-0.5 text-xs text-white/60">{v.duration}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-5">
                    <h2 className="font-display text-lg font-bold text-ink">{v.title}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{v.body}</p>
                  </div>
                </div>
              </article>
            );
          })}
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
