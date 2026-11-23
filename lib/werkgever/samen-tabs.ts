// ---------------------------------------------------------------------------
// Samengevoegde menu-ingangen van het werkgeversdashboard (20 nov 2026, eigenaar:
// "voeg samen"). Met de vlag `publiek-alleen-flexwerk` aan staan de leden van
// een groep als één menu-item (lib/werkgever/werkruimte.ts, SAMENVOEGINGEN) en
// staan bovenaan hun pagina's tabbladen (components/werkgever/SamenTabs.tsx).
// Zonder de vlag staan de leden los in het menu en tonen de pagina's geen tabs.
// Puur bestand: de tabbladen, het menu en de tests lezen dezelfde lijst.
// ---------------------------------------------------------------------------

import type { MenuSleutel } from "@/lib/werkgever/werkruimte";

export type SamenGroep = "planning" | "uren" | "werkers" | "regels" | "cijfers" | "chat";

export interface SamenTab {
  /** de menu-sleutel van de losse pagina (zonder vlag) */
  id: MenuSleutel;
  href: string;
  label: string;
}

export interface SamenGroepDef {
  /** de menu-sleutel van de samengevoegde ingang (nieuw, of de eerste van de leden) */
  sleutel: MenuSleutel;
  /** het label van de ingang in het menu */
  label: string;
  tabs: readonly SamenTab[];
}

export const SAMEN_GROEPEN: Record<SamenGroep, SamenGroepDef> = {
  planning: {
    sleutel: "planning",
    label: "Planning",
    tabs: [
      { id: "kalender", href: "/werkgever/kalender", label: "Kalender" },
      { id: "planner", href: "/werkgever/planner", label: "Roosterplanner" },
      { id: "agenda", href: "/werkgever/agenda", label: "Agenda" },
    ],
  },
  uren: {
    sleutel: "uren",
    label: "Uren",
    tabs: [
      { id: "uren", href: "/werkgever/uren", label: "Goedkeuren" },
      { id: "inchecken", href: "/werkgever/inchecken", label: "Inchecken met QR-code" },
    ],
  },
  werkers: {
    sleutel: "werkers",
    label: "Mijn werkers",
    tabs: [
      { id: "favorieten", href: "/werkgever/favorieten", label: "Favorieten" },
      { id: "geblokkeerd", href: "/werkgever/geblokkeerd", label: "Geblokkeerd" },
    ],
  },
  regels: {
    sleutel: "regels",
    label: "Regels en overeenkomsten",
    tabs: [
      { id: "compliance", href: "/werkgever/compliance", label: "Compliance" },
      { id: "overeenkomsten", href: "/werkgever/overeenkomsten", label: "Modelovereenkomsten" },
    ],
  },
  cijfers: {
    sleutel: "cijfers",
    label: "Cijfers",
    tabs: [
      { id: "rapportages", href: "/werkgever/rapportages", label: "Rapportages" },
      { id: "inkaart", href: "/werkgever/in-kaart", label: "Bedrijf in kaart" },
    ],
  },
  chat: {
    sleutel: "berichten",
    label: "Chat",
    tabs: [
      { id: "berichten", href: "/werkgever/berichten", label: "Berichten" },
      { id: "assistent", href: "/werkgever/assistent", label: "Assistent" },
    ],
  },
};

/** De naam van elke samengevoegde ingang in het Engels (de werkgeversapp is tweetalig). */
export const SAMEN_LABEL_EN: Record<SamenGroep, string> = {
  planning: "Planning",
  uren: "Hours",
  werkers: "My workers",
  regels: "Rules and agreements",
  cijfers: "Figures",
  chat: "Chat",
};

/**
 * De naam van een samengevoegde ingang in de taal van de app. Het menu én de titel van de pagina gebruiken deze ene naam
 * (ronde 2, 23 nov 2026: het menu zei "Planning" en "Mijn werkers" terwijl de pagina's "Kalender" en "Favorieten" heetten).
 */
export const samenLabel = (groep: SamenGroep, locale: string): string => (locale === "en" ? SAMEN_LABEL_EN[groep] : SAMEN_GROEPEN[groep].label);

/** De samenvoegingen als lijst, in menu-volgorde: welke sleutel de leden vervangt. */
export const SAMENVOEGINGEN: readonly { sleutel: MenuSleutel; leden: readonly MenuSleutel[] }[] = (Object.keys(SAMEN_GROEPEN) as SamenGroep[]).map((g) => ({
  sleutel: SAMEN_GROEPEN[g].sleutel,
  leden: SAMEN_GROEPEN[g].tabs.map((t) => t.id),
}));

/** Alle tabs die ergens in een groep zitten, met hun groep (voor de tests en de tabbladen). */
export const groepVan = (id: MenuSleutel): SamenGroep | null => ((Object.keys(SAMEN_GROEPEN) as SamenGroep[]).find((g) => SAMEN_GROEPEN[g].tabs.some((t) => t.id === id)) ?? null);
