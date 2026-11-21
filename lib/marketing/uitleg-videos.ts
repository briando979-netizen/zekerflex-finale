// De uitlegfilmpjes van /uitleg (public/videos/<slug>.mp4, gemaakt met scripts/uitleg-videos/: echte schermen met onze eigen
// stem). /uitleg en de videokamer /uitleg/videos lezen dezelfde lijst. Puur bestand.

export interface UitlegVideo {
  slug: string;
  title: string;
  duration: string;
  body: string;
}

export const UITLEG_VIDEOS: readonly UitlegVideo[] = [
  {
    slug: "wat-is-zekerflex",
    title: "Wat is ZekerFlex?",
    duration: "35 sec",
    body: "Eén platform voor freelancers en uitzendkrachten, alles digitaal geregeld. Uitzendkrachten werken via een aangesloten uitzendbureau.",
  },
  {
    slug: "klus-plaatsen",
    title: "Zo plaats je een klus",
    duration: "25 sec",
    body: "Van functie en tarief tot bevestigde kracht — je zet een klus in een paar minuten live.",
  },
  {
    slug: "uitzenden-of-freelance",
    title: "Uitzenden of freelance — het verschil",
    duration: "25 sec",
    body: "Loonstrook, vakantiegeld en pensioen via een aangesloten uitzendbureau, of een zzp'er met eigen factuur.",
  },
  {
    slug: "uren-goedkeuren",
    title: "Uren goedkeuren in 30 seconden",
    duration: "30 sec",
    body: "Ingevulde uren, één tik akkoord. Daarna loopt de facturatie automatisch; een uitzendkracht wordt verloond door zijn uitzendbureau.",
  },
  {
    slug: "kosten-en-facturen",
    title: "Wat kost het en hoe zit het met facturen?",
    duration: "30 sec",
    body: "€ 3,50 per gewerkt uur, één heldere factuur. Bij uitzenden factureert het uitzendbureau zelf, met zijn eigen tarief.",
  },
];
