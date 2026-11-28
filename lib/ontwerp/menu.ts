import { vt } from "@/lib/i18n/site";
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

export const STANDAARD_SLOGAN = vt(
  "Zeker van je werk, zeker van je mensen. Het onafhankelijke Nederlandse platform voor flexibel werk en voor je hele bedrijf. Bekijk ons privacybeleid voor informatie over gegevensverwerking en betrokken dienstverleners.");

export const STANDAARD_KOLOMMEN: VoettekstKolom[] = [
  {
    titel: vt("Platform"),
    links: [
      { href: "/aanbod", label: vt("Het hele aanbod") },
      { href: "/aanbod/horeca", label: vt("Horecasoftware") },
      { href: "/aanbod/website", label: vt("Website laten maken") },
      { href: "/klussen", label: vt("Open klussen") },
      { href: "/open-diensten", label: vt("Open diensten op de kaart") },
      { href: "/freelance-werk", label: vt("Freelance werk per stad") },
      { href: "/bijbaan", label: vt("Bijbaan per stad") },
      { href: "/personeel-inhuren", label: vt("Personeel inhuren") },
      { href: "/voor-freelancers", label: vt("Voor freelancers") },
      { href: "/leren/klussen-krijgen", label: vt("Leren: zo krijg je klussen") },
      // 21 nov: "Werken via uitzendbureau" weg (eigenaar: geen aparte pagina; uitzendklussen staan in de app)
      { href: "/uitzendpartner", label: vt("Voor uitzendbureaus") },
      // 22 nov 2026: /voor-bedrijven is samengevoegd in /bedrijven
      { href: "/bedrijven", label: vt("Voor bedrijven") },
      { href: "/leren/personeel-krijgen", label: vt("Leren: zo krijg je goede mensen") },
      { href: "/voor-bureaus", label: vt("Voor bureaus (white-label)") },
      { href: "/sales-partner", label: vt("Word sales-partner (commissie)") },
      { href: "/prijzen", label: vt("Prijzen") },
      { href: "/tarieven-overzicht", label: vt("Tarievenoverzicht") },
      { href: "/app", label: vt("Download de app") },
      { href: "/status", label: vt("Systeemstatus") },
      { href: "/developers", label: vt("API voor ontwikkelaars") },
    ],
  },
  {
    titel: vt("Kennis"),
    links: [
      { href: "/kennis", label: vt("Informatie") },
      { href: "/uitleg", label: vt("Uitleg in het kort") },
      { href: "/kennis#kennisbank", label: vt("Kennisbank") },
      { href: "/kennis/wet-dba", label: vt("Wet DBA") },
      // 22 nov 2026: de functiepagina's (lib/seo-functies.ts); de kolom Platform zit op het maximum (MAX_LINKS)
      { href: "/werken-als", label: vt("Werken als: per functie") },
      { href: "/kennis/werkgevers", label: vt("Helpcentrum werkgevers") },
      // 22 nov 2026: korte antwoorden voor bedrijven (lib/seo-vragen.ts); de kolom Kennis had nog ruimte (MAX_LINKS)
      { href: "/vragen", label: vt("Vragen van bedrijven") },
      { href: "/kennis/whitepapers", label: vt("Whitepapers") },
      { href: "/rekentools", label: vt("Gratis rekentools") },
      { href: "/nieuws", label: vt("Nieuwsroom") },
      // 22 nov 2026: de community op de site zelf (lib/community)
      { href: "/community", label: vt("Community") },
      { href: "/kennis/blog", label: vt("Blog") },
      { href: "/kennis/faq", label: vt("Veelgestelde vragen") },
    ],
  },
  {
    titel: vt("Bedrijf"),
    // 22 nov 2026 (gebruikersonderzoek): de telefoon en info@ staan al in de regel met de bedrijfsgegevens onderaan, en
    // /status stond er drie keer; hier dus alleen nog "Systeemstatus" in Platform
    links: [
      { href: "/over-ons", label: vt("Over ZekerFlex") },
      { href: "/contact", label: vt("Contact") },
      { href: "/demo", label: vt("Vraag een demo aan") },
      { href: "/over-ons#werken-bij", label: vt("Werken bij ons") },
      { href: "/login", label: vt("Inloggen") },
    ],
  },
];

/**
 * De kolommen zonder dubbele links (22 nov 2026, gebruikersonderzoek: /status stond er drie keer, de telefoon en info@
 * twee keer). Een adres dat al elders in de voettekst staat (`alElders`: de telefoon en het mailadres in de regel met de
 * bedrijfsgegevens) valt weg, en van elk adres blijft alleen de eerste link over. Werkt ook op een eigen versie uit de
 * Site-ontwerper; een kolom die zo leeg raakt, valt weg.
 */
export function voettekstZonderDubbel(kolommen: VoettekstKolom[], alElders: readonly string[] = []): VoettekstKolom[] {
  const gezien = new Set(alElders.map((h) => h.trim().toLowerCase()));
  return kolommen
    .map((k) => ({
      ...k,
      links: k.links.filter((l) => {
        const sleutel = l.href.trim().toLowerCase();
        if (gezien.has(sleutel)) return false;
        gezien.add(sleutel);
        return true;
      }),
    }))
    .filter((k) => k.links.length > 0);
}

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
