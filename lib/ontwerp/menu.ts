import { veiligeLink } from "@/lib/ontwerp/paginas";

// ---------------------------------------------------------------------------
// De voettekst van de eigen site, bewerkbaar in de Site-ontwerper (tabblad
// Menu). Zonder eigen versie toont de site exact de standaard hieronder (dat
// was de vaste lijst in components/marketing/SiteFooter.tsx). Puur en
// browser-veilig: de editor en de server gebruiken dezelfde normalisatie.
// ---------------------------------------------------------------------------

export interface MenuLink {
  label: string;
  href: string;
}

export interface VoettekstKolom {
  titel: string;
  links: MenuLink[];
}

export interface Voettekst {
  /** de zin onder het logo */
  slogan: string;
  kolommen: VoettekstKolom[];
}

export const STANDAARD_SLOGAN =
  "Zeker van je werk, zeker van je mensen. Het onafhankelijke Nederlandse platform voor flexibel werk en voor je hele bedrijf. Bekijk ons privacybeleid voor informatie over gegevensverwerking en betrokken dienstverleners.";

export const STANDAARD_KOLOMMEN: VoettekstKolom[] = [
  {
    titel: "Platform",
    links: [
      { href: "/aanbod", label: "Het hele aanbod" },
      { href: "/aanbod/horeca", label: "Horecasoftware" },
      { href: "/aanbod/rijschool", label: "Rijschoolsoftware" },
      { href: "/aanbod/website", label: "Website laten maken" },
      { href: "/klussen", label: "Open klussen" },
      { href: "/open-diensten", label: "Open diensten op de kaart" },
      { href: "/freelance-werk", label: "Freelance werk per stad" },
      { href: "/personeel-inhuren", label: "Personeel inhuren" },
      { href: "/voor-freelancers", label: "Voor freelancers" },
      { href: "/uitzendbureau", label: "Werken via uitzendbureau" },
      { href: "/voor-bedrijven", label: "Voor bedrijven" },
      { href: "/producten", label: "Producten & losse modules" },
      { href: "/voor-bureaus", label: "Voor bureaus (white-label)" },
      { href: "/sales-partner", label: "Word sales-partner (commissie)" },
      { href: "/prijzen", label: "Prijzen" },
      { href: "/shop", label: "ZekerFlex shop" },
      { href: "/website-check", label: "Gratis website-check" },
      { href: "/app", label: "Download de app" },
      { href: "/status", label: "Systeemstatus" },
      { href: "/developers", label: "API voor ontwikkelaars" },
    ],
  },
  {
    titel: "Kennis",
    links: [
      { href: "/kennis", label: "Informatie" },
      { href: "/uitleg", label: "Uitleg in het kort" },
      { href: "/kennis#kennisbank", label: "Kennisbank" },
      { href: "/kennis/wet-dba", label: "Wet DBA" },
      { href: "/kennis/werkgevers", label: "Helpcentrum werkgevers" },
      { href: "/kennis/whitepapers", label: "Whitepapers" },
      { href: "/rekentools", label: "Gratis rekentools" },
      { href: "/kennis/blog", label: "Blog" },
      { href: "/kennis/faq", label: "Veelgestelde vragen" },
    ],
  },
  {
    titel: "Bedrijf",
    links: [
      { href: "/over-ons", label: "Over ZekerFlex" },
      { href: "/contact", label: "Contact" },
      { href: "tel:+3197010251797", label: "📞 +31 970 102 51797" },
      { href: "/demo", label: "Vraag een demo aan" },
      { href: "/over-ons#werken-bij", label: "Werken bij ons" },
      { href: "/status", label: "Uptime & incidenten" },
      { href: "mailto:info@zekerflex.com", label: "info@zekerflex.com" },
      { href: "/login", label: "Inloggen" },
    ],
  },
];

export const STANDAARD_VOETTEKST: Voettekst = { slogan: STANDAARD_SLOGAN, kolommen: STANDAARD_KOLOMMEN };
export const MAX_KOLOMMEN = 4;
export const MAX_LINKS = 25;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const tekst = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Elke link moet een tekst en een veilig adres hebben; anders valt hij weg. */
export function normalizeVoettekst(raw: unknown): Voettekst {
  const r = obj(raw);
  const kolommen = (Array.isArray(r.kolommen) ? r.kolommen : [])
    .slice(0, MAX_KOLOMMEN)
    .map((k) => {
      const kol = obj(k);
      return {
        titel: tekst(kol.titel, 40),
        links: (Array.isArray(kol.links) ? kol.links : [])
          .slice(0, MAX_LINKS)
          .map((l) => ({ label: tekst(obj(l).label, 60), href: veiligeLink(obj(l).href) }))
          .filter((l) => l.label && l.href),
      };
    })
    .filter((k) => k.titel || k.links.length);
  return { slogan: typeof r.slogan === "string" ? r.slogan.trim().slice(0, 400) : STANDAARD_SLOGAN, kolommen };
}
