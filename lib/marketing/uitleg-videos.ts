// De uitlegfilmpjes van /uitleg (public/videos/<slug>.mp4). Sinds 21 nov 2026 in de stijl van de reclamevideo's, met een
// Nederlandse mannenstem (Chatterbox, zelf gedraaid) en ware tekst: ZekerFlex is zelf geen uitzendbureau en geen werkgever.
// /uitleg en de videokamer /uitleg/videos lezen dezelfde lijst. Puur bestand.

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
    duration: "36 sec",
    body: "Een platform voor flexwerk; zelf geen uitzendbureau en geen werkgever.",
  },
  {
    slug: "klus-plaatsen",
    title: "Zo plaats je een klus",
    duration: "28 sec",
    body: "Functie, plaats en tijd invullen, meteen zien wat het kost, en zelf kiezen wie er komt.",
  },
  {
    slug: "uitzenden-of-freelance",
    title: "Uitzenden of freelance — het verschil",
    duration: "40 sec",
    body: "Een zzp'er werkt met een eigen KVK-nummer; een uitzendkracht via een aangesloten uitzendbureau, dat de werkgever is.",
  },
  {
    slug: "uren-goedkeuren",
    title: "Inchecken en uren goedkeuren",
    duration: "32 sec",
    body: "De werker scant de QR-code die jij ophangt; daarna keur je de uren goed en komen de facturen vanzelf.",
  },
  {
    slug: "kosten-en-facturen",
    title: "Wat kost het en hoe zit het met facturen?",
    duration: "36 sec",
    body: "€ 3,50 platformkosten per gewerkt uur, zonder abonnement en de eerste maand gratis; de facturen maakt ZekerFlex automatisch.",
  },
];
