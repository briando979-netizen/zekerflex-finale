// ---------------------------------------------------------------------------
// De sociale kanalen die voor ZekerFlex als bedrijf van belang zijn. Puur (geen prisma, geen kv):
// ook bruikbaar in de browser en in tests. Per kanaal: wat erin past, hoe je koppelt en of
// ZekerFlex er zelf kan plaatsen (alleen Facebook en Instagram, via de Meta-koppeling) of dat
// een mens het bericht plaatst (de tekst staat dan klaar met een knop).
// ---------------------------------------------------------------------------

export const KANAAL_IDS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "x", "whatsapp", "google"] as const;
export type KanaalId = (typeof KANAAL_IDS)[number];

export type PlaatsWijze = "api" | "handmatig";

export interface KanaalDef {
  id: KanaalId;
  naam: string;
  /** één regel: waarom dit kanaal voor ZekerFlex telt */
  waarom: string;
  /** welk publiek je er bereikt */
  publiek: "werkers" | "werkgevers" | "beide";
  maxTekens: number;
  maxHashtags: number;
  /** beeld: nodig, handig of video */
  beeld: "verplicht" | "optioneel" | "video";
  wijze: PlaatsWijze;
  /** profiel zoals het in de site (footer, Google-gegevens) staat; moet nog bevestigd worden door de eigenaar */
  standaardProfiel: string;
  /** hoe je het koppelt, in gewoon Nederlands */
  koppelen: string[];
  /** wat ZekerFlex hier nog niet kan, eerlijk */
  beperking: string | null;
}

export const KANALEN: readonly KanaalDef[] = [
  {
    id: "instagram",
    naam: "Instagram",
    waarom: "Zichtbaar voor jonge werkers en voor horeca en winkels; foto's en korte video's.",
    publiek: "beide",
    maxTekens: 2200,
    maxHashtags: 15,
    beeld: "verplicht",
    wijze: "api",
    standaardProfiel: "https://www.instagram.com/zekerflex",
    koppelen: [
      "Zet het Instagram-account om naar een zakelijk account en koppel het aan de Facebook-pagina.",
      "Maak een app op developers.facebook.com (gratis) en geef de paginatoken aan ZekerFlex bij Facebook & Instagram hieronder.",
    ],
    beperking: "Een bericht op Instagram heeft altijd een beeld nodig.",
  },
  {
    id: "facebook",
    naam: "Facebook",
    waarom: "Pagina en groepen: werkers vinden hier klussen in hun buurt, werkgevers lezen mee.",
    publiek: "beide",
    maxTekens: 3000,
    maxHashtags: 5,
    beeld: "optioneel",
    wijze: "api",
    standaardProfiel: "",
    koppelen: [
      "Maak een Facebook-bedrijfspagina voor ZekerFlex (gratis).",
      "Maak een app op developers.facebook.com, voeg jezelf toe als beheerder en geef de paginatoken aan ZekerFlex bij Facebook & Instagram hieronder.",
    ],
    beperking: null,
  },
  {
    id: "linkedin",
    naam: "LinkedIn",
    waarom: "Hier zitten werkgevers, HR en uitzendbureaus: de beste plek voor zakelijke klanten.",
    publiek: "werkgevers",
    maxTekens: 3000,
    maxHashtags: 5,
    beeld: "optioneel",
    wijze: "handmatig",
    standaardProfiel: "",
    koppelen: ["Maak een LinkedIn-bedrijfspagina en vul de link hieronder in. ZekerFlex zet de tekst voor je klaar."],
    beperking: "LinkedIn geeft bedrijfspagina's alleen na een aparte goedkeuring van LinkedIn toegang voor automatisch plaatsen. Daarom plaats jij zelf met één klik.",
  },
  {
    id: "tiktok",
    naam: "TikTok",
    waarom: "Korte video's voor jonge flexwerkers; goed voor bereik zonder advertentiegeld.",
    publiek: "werkers",
    maxTekens: 2200,
    maxHashtags: 6,
    beeld: "video",
    wijze: "handmatig",
    standaardProfiel: "https://www.tiktok.com/@zekerflex",
    koppelen: ["Vul de link naar het account in. ZekerFlex schrijft het script en de beschrijving; jij uploadt de video."],
    beperking: "Automatisch plaatsen op TikTok kan pas na een audit van TikTok. Tot die tijd plaats je zelf.",
  },
  {
    id: "youtube",
    naam: "YouTube",
    waarom: "Uitleg-video's en shorts; blijft jaren vindbaar in Google.",
    publiek: "beide",
    maxTekens: 5000,
    maxHashtags: 5,
    beeld: "video",
    wijze: "handmatig",
    standaardProfiel: "https://www.youtube.com/@Zekerflex",
    koppelen: ["Vul de link naar het kanaal in. ZekerFlex schrijft titel en beschrijving; jij uploadt de video."],
    beperking: "Uploaden naar YouTube vraagt een eigen Google-toestemming die nog niet is ingericht.",
  },
  {
    id: "x",
    naam: "X",
    waarom: "Korte nieuwsberichten en meeluisteren met de sector.",
    publiek: "werkgevers",
    maxTekens: 280,
    maxHashtags: 2,
    beeld: "optioneel",
    wijze: "handmatig",
    standaardProfiel: "",
    koppelen: ["Vul de link naar het account in. De tekst staat klaar op 280 tekens."],
    beperking: "Automatisch plaatsen op X is betaald; daarom plaats je zelf met één klik.",
  },
  {
    id: "whatsapp",
    naam: "WhatsApp-kanaal",
    waarom: "Werkers krijgen nieuwe klussen direct op hun telefoon, zonder algoritme.",
    publiek: "werkers",
    maxTekens: 4096,
    maxHashtags: 0,
    beeld: "optioneel",
    wijze: "handmatig",
    standaardProfiel: "",
    koppelen: ["Maak een WhatsApp-kanaal in de WhatsApp-app en vul de uitnodigingslink in."],
    beperking: "WhatsApp-kanalen hebben geen koppeling om automatisch te plaatsen.",
  },
  {
    id: "google",
    naam: "Google Bedrijfsprofiel",
    waarom: "Wie ZekerFlex googelt ziet hier foto's, reviews en berichten.",
    publiek: "beide",
    maxTekens: 1500,
    maxHashtags: 0,
    beeld: "optioneel",
    wijze: "handmatig",
    standaardProfiel: "",
    koppelen: ["Open het bedrijfsprofiel op google.com/business en vul de link hieronder in."],
    beperking: "Berichten op Google Bedrijfsprofiel plaats je zelf; de koppeling daarvoor is niet beschikbaar zonder goedkeuring van Google.",
  },
];

const PER_ID = new Map(KANALEN.map((k) => [k.id, k] as const));

export function kanaalDef(id: string): KanaalDef | null {
  return PER_ID.get(id as KanaalId) ?? null;
}

export function isKanaalId(id: string): id is KanaalId {
  return PER_ID.has(id as KanaalId);
}

// --- tekst per kanaal --------------------------------------------------------

/** Maakt hashtags netjes: één #, geen spaties of leestekens, geen dubbelen, hooguit `max`. */
export function schoneHashtags(tags: readonly string[], max: number): string[] {
  const uit: string[] = [];
  if (max <= 0) return uit;
  for (const t of tags) {
    const kaal = t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!kaal) continue;
    const tag = `#${kaal}`;
    if (!uit.some((x) => x.toLowerCase() === tag.toLowerCase())) uit.push(tag);
    if (uit.length >= max) break;
  }
  return uit;
}

/** Kort een tekst in tot `max` tekens, liefst op het einde van een zin of woord. */
export function kortIn(tekst: string, max: number): string {
  const t = tekst.trim();
  if (t.length <= max) return t;
  const stuk = t.slice(0, max - 1);
  const zin = Math.max(stuk.lastIndexOf(". "), stuk.lastIndexOf("! "), stuk.lastIndexOf("? "));
  if (zin > max * 0.5) return stuk.slice(0, zin + 1).trim();
  const woord = stuk.lastIndexOf(" ");
  return `${(woord > max * 0.5 ? stuk.slice(0, woord) : stuk).trim()}…`;
}

/** De tekst zoals hij op dit kanaal geplaatst wordt: binnen de limiet, met de hashtags die passen. */
export function tekstVoorKanaal(id: KanaalId, tekst: string, hashtags: readonly string[]): string {
  const def = kanaalDef(id);
  if (!def) return tekst.trim();
  const tags = schoneHashtags(hashtags, def.maxHashtags);
  const staart = tags.length ? `\n\n${tags.join(" ")}` : "";
  return `${kortIn(tekst, Math.max(20, def.maxTekens - staart.length))}${staart}`.trim();
}

/** Een link waarmee een mens het bericht met één klik zelf plaatst; null als het kanaal dat niet kent. */
export function deelLink(id: KanaalId, tekst: string, url: string): string | null {
  const t = encodeURIComponent(tekst);
  const u = encodeURIComponent(url);
  switch (id) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "x":
      return `https://x.com/intent/post?text=${t}&url=${u}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${tekst}\n${url}`)}`;
    default:
      return null;
  }
}

/** Waar open je het kanaal om te plaatsen (als er geen deelknop is). */
export function plaatsAdres(id: KanaalId, profielUrl: string): string {
  switch (id) {
    case "instagram":
      return "https://www.instagram.com/";
    case "tiktok":
      return "https://www.tiktok.com/upload";
    case "youtube":
      return "https://studio.youtube.com/";
    case "google":
      return "https://business.google.com/";
    case "linkedin":
      return profielUrl || "https://www.linkedin.com/feed/";
    default:
      return profielUrl || "";
  }
}

/** Referrer-hosts uit de bezoekcijfers die van sociale media komen, per kanaal. */
export const REFERRER_PER_KANAAL: Record<KanaalId, readonly string[]> = {
  instagram: ["instagram.com", "l.instagram.com"],
  facebook: ["facebook.com", "m.facebook.com", "l.facebook.com", "lm.facebook.com", "fb.com"],
  linkedin: ["linkedin.com", "lnkd.in", "www.linkedin.com"],
  tiktok: ["tiktok.com", "vm.tiktok.com"],
  youtube: ["youtube.com", "m.youtube.com", "youtu.be"],
  x: ["x.com", "t.co", "twitter.com"],
  whatsapp: ["whatsapp.com", "wa.me", "api.whatsapp.com"],
  google: [],
};

export function kanaalVanReferrer(host: string): KanaalId | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const id of KANAAL_IDS) if (REFERRER_PER_KANAAL[id].includes(h)) return id;
  return null;
}
