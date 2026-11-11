import { BRANCHE_VOORBEELDEN } from "@/lib/sites/branche-voorbeelden";
import { SECTOR_TEMPLATES, pagesFromTemplate, type Company, type Page, type SiteSoort, type Theme } from "@/lib/sites/types";
import { WEBSHOP_TEMPLATES, webshopPages } from "@/lib/sites/webshop-templates";

// ---------------------------------------------------------------------------
// Studio → Ontwerpen (11 nov 2026, vraag van de eigenaar: "ik zie de templates
// niet; zoals Wix en Shopify"): elk ontwerp van Website bouwen (de startpunten
// per branche, SECTOR_TEMPLATES, met de voorbeeldsite van die branche) en van
// Webshop openen (WEBSHOP_TEMPLATES, met een voorbeeldwinkel) als kaart in een
// galerij, ook als de site er al is. De foto op een kaart is een vast bestand
// uit public/ (met CREDITS.md in dezelfde map); de kleuren tekent de kaart zelf.
// Geen schermafdrukken. Puur: alleen gegevens. Wisselen: lib/sites/ontwerp-wissel.ts.
// ---------------------------------------------------------------------------

/** Wat een ontwerp aan de stijl van een site verandert. Het logo blijft van het bedrijf. */
export interface OntwerpThema {
  kleur: string;
  accent: string;
  lettertype: Theme["lettertype"];
  hoeken: Theme["hoeken"];
  stijl: NonNullable<Theme["stijl"]>;
}

export interface Ontwerp {
  /** = de id van het startpunt (SECTOR_TEMPLATES of WEBSHOP_TEMPLATES) */
  id: string;
  soort: SiteSoort;
  naam: string;
  omschrijving: string;
  /** het filter boven de galerij */
  categorie: string;
  /** de foto op de kaart: een vast bestand in public/ */
  foto: string;
  thema: OntwerpThema;
  /** het voorbeeld op /site/<slug>; null = geen voorbeeld */
  voorbeeldSlug: string | null;
}

/** Een kaart in de galerij, zoals de pagina hem aan het scherm geeft. */
export interface OntwerpKaart {
  id: string;
  naam: string;
  omschrijving: string;
  categorie: string;
  foto: string;
  thema: OntwerpThema;
  stijlNaam: string;
  /** het adres van het voorbeeld (/site/<slug>), alleen als dat er echt is */
  voorbeeld: string | null;
}

/** De namen van de stijlen zoals Studio → Ontwerp ze noemt. */
export const STIJL_NAMEN: Record<OntwerpThema["stijl"], string> = { beleving: "Beleving", premium: "Premium", luxe: "Luxe", standaard: "Eenvoudig" };

/** De kaart van een ontwerp; `metVoorbeeld`: het voorbeeld bestaat (lib/sites/ontwerpen-server.ts). */
export function kaartVan(o: Ontwerp, metVoorbeeld: boolean): OntwerpKaart {
  return {
    id: o.id,
    naam: o.naam,
    omschrijving: o.omschrijving,
    categorie: o.categorie,
    foto: o.foto,
    thema: o.thema,
    stijlNaam: STIJL_NAMEN[o.thema.stijl],
    voorbeeld: metVoorbeeld && o.voorbeeldSlug ? `/site/${o.voorbeeldSlug}` : null,
  };
}

const WEBSITE_CATEGORIE: Readonly<Record<string, string>> = {
  algemeen: "Zakelijke dienstverlening",
  schoonmaak: "Zakelijke dienstverlening",
  logistiek: "Zakelijke dienstverlening",
  horeca: "Horeca",
  bouw: "Bouw en auto",
  garage: "Bouw en auto",
  zorg: "Zorg en verzorging",
  kapper: "Zorg en verzorging",
};

// foto's met een vrije licentie die al in public/ staan (bron in CREDITS.md van die map)
const WEBSHOP_KAART: Readonly<Record<string, { categorie: string; foto: string }>> = {
  algemeen: { categorie: "Algemeen", foto: "/shifts/retail.jpg" },
  mode: { categorie: "Mode en verzorging", foto: "/shop/werk-tshirt-2pack.jpg" },
  beauty: { categorie: "Mode en verzorging", foto: "/voorbeeldsites/kapper.jpg" },
  eten: { categorie: "Eten en drinken", foto: "/voorbeeldsites/burger.jpg" },
  wonen: { categorie: "Wonen en cadeaus", foto: "/shifts/productie.jpg" },
  vakwinkel: { categorie: "Zakelijk en techniek", foto: "/shop/werkhandschoenen-grip.jpg" },
};

/** Het adres van de voorbeeldwinkel bij een startpunt van de webshop (lib/sites/winkel-voorbeelden.ts). */
export const winkelVoorbeeldSlug = (templateId: string): string => `voorbeeldwinkel-${templateId}`;

const uit = <T>(tabel: Readonly<Record<string, T>>, id: string): T | undefined => (Object.hasOwn(tabel, id) ? tabel[id] : undefined);

function websiteOntwerpen(): Ontwerp[] {
  return SECTOR_TEMPLATES.map((t): Ontwerp => {
    const v = BRANCHE_VOORBEELDEN.find((x) => x.id === t.id);
    return {
      id: t.id,
      soort: "website",
      naam: t.naam,
      omschrijving: t.omschrijving,
      categorie: uit(WEBSITE_CATEGORIE, t.id) ?? "Overig",
      foto: v ? (v.kaart ?? `/shifts/${v.id}.jpg`) : "/shifts/algemeen.jpg",
      // precies wat de voorbeeldsite laat zien; zonder voorbeeld de kleuren van het startpunt in de huisstijl van nieuwe sites
      thema: v
        ? { kleur: v.theme.kleur, accent: v.theme.accent, lettertype: v.theme.lettertype, hoeken: v.theme.hoeken, stijl: v.theme.stijl ?? "beleving" }
        : { kleur: t.theme.kleur, accent: t.theme.accent, lettertype: "modern", hoeken: "rond", stijl: "beleving" },
      voorbeeldSlug: v?.slug ?? null,
    };
  });
}

function webshopOntwerpen(): Ontwerp[] {
  return WEBSHOP_TEMPLATES.map((t): Ontwerp => {
    const kaart = uit(WEBSHOP_KAART, t.id);
    return {
      id: t.id,
      soort: "webshop",
      naam: t.naam,
      omschrijving: t.omschrijving,
      categorie: kaart?.categorie ?? "Overig",
      foto: kaart?.foto ?? "/shifts/retail.jpg",
      // zoals een nieuwe webshop begint (lib/sites/store.ts createSite): witte productkaarten op crème
      thema: { kleur: t.theme.kleur, accent: t.theme.accent, lettertype: "modern", hoeken: "rond", stijl: "premium" },
      voorbeeldSlug: winkelVoorbeeldSlug(t.id),
    };
  });
}

/** Alle ontwerpen van een soort, in de volgorde van de startpunten. */
export function ontwerpenVoor(soort: SiteSoort): Ontwerp[] {
  return soort === "webshop" ? webshopOntwerpen() : websiteOntwerpen();
}

export function ontwerpVoor(soort: SiteSoort, id: string): Ontwerp | null {
  return ontwerpenVoor(soort).find((o) => o.id === id) ?? null;
}

/** De filters boven de galerij: elke categorie één keer, in de volgorde waarin ze voorkomen. */
export function categorieenVan(ontwerpen: readonly Pick<Ontwerp, "categorie">[]): string[] {
  return [...new Set(ontwerpen.map((o) => o.categorie))];
}

/**
 * De pagina-opzet van een ontwerp voor dit bedrijf: de pagina's en blokken van het startpunt,
 * met algemene teksten en de eigen bedrijfsnaam (nooit de verzonnen teksten van een voorbeeldsite).
 */
export function opzetVoor(o: Pick<Ontwerp, "id" | "soort">, bedrijf: Company, newId: () => string): Page[] {
  if (o.soort === "webshop") {
    const t = WEBSHOP_TEMPLATES.find((x) => x.id === o.id);
    return t ? webshopPages(t, bedrijf, newId) : [];
  }
  const t = SECTOR_TEMPLATES.find((x) => x.id === o.id);
  return t ? pagesFromTemplate(t, bedrijf, newId) : [];
}
