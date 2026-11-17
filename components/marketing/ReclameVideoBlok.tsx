import Link from "next/link";
import { Section } from "@/components/marketing/primitives";

// Een korte reclamevideo met onze eigen campagnebeelden (17 nov 2026), zonder geluid. Servercomponent, geen scripts: de video
// laadt pas bij het afspelen (preload="none"). De bestanden staan in public/videos/reclame/ (bron: zie CREDITS.md daar).
const VIDEOS = {
  werkers: {
    kop: "Jouw dag. Jouw klus.",
    tekst: "Horeca, magazijn, bezorgen, winkel of festival: kies zelf wanneer je werkt. Met of zonder KVK.",
    knop: "Meld je gratis aan",
    href: "/register",
    seconden: 20,
    omschrijving: "Reclamevideo voor werkers: zes soorten werk in beeld, met de tekst Meld je gratis aan.",
  },
  bedrijven: {
    kop: "Personeel nodig? Plaats je klus.",
    tekst: "Een gat in je rooster of drukte op komst: € 3,50 per gewerkt uur, zonder abonnement.",
    knop: "Plaats een klus",
    href: "/klus-plaatsen",
    seconden: 14,
    omschrijving: "Reclamevideo voor bedrijven: ondernemers in beeld, met de tekst Plaats je klus.",
  },
} as const;

export function ReclameVideoBlok({ soort }: { soort: keyof typeof VIDEOS }) {
  const v = VIDEOS[soort];
  return (
    <Section>
      <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <figure>
          <div className="overflow-hidden rounded-2xl border border-hair bg-ink shadow-xl">
            <video
              controls
              muted
              playsInline
              preload="none"
              poster={`/videos/reclame/${soort}.jpg`}
              className="aspect-video w-full bg-ink"
              src={`/videos/reclame/${soort}.mp4`}
              aria-label={v.omschrijving}
            />
          </div>
          <figcaption className="mt-3 text-xs text-neutralx-500">Eigen beelden, gemaakt met AI: de personen in beeld bestaan niet. Zonder geluid.</figcaption>
        </figure>
        <div>
          <p className="eyebrow">In {v.seconden} seconden</p>
          <h2 className="mt-3 text-balance font-display text-2xl font-bold leading-tight text-ink md:text-3xl">{v.kop}</h2>
          <p className="mt-3 text-neutralx-600">{v.tekst}</p>
          <Link href={v.href} className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">
            {v.knop}
          </Link>
        </div>
      </div>
    </Section>
  );
}
