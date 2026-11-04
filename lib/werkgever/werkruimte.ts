// ---------------------------------------------------------------------------
// De werkruimte van een bedrijf: wat voor bedrijf het is, bepaalt het menu en
// het startscherm van /werkgever. Een rijschool ziet eerst haar rijschool, een
// horecazaak haar zaak, wie alleen een website of webshop heeft de studio, en
// een bedrijf dat personeel inhuurt het gewone dashboard (ongewijzigd).
// Het bedrijf kiest zelf (KV "werkruimte:<tenantId>"); zonder keuze leiden we
// het af uit wat het al gebruikt. Wie ooit een klus plaatste, houdt altijd alle
// personeelsfuncties in het menu: niets wat iemand gebruikt, verdwijnt.
// Puur (geen prisma of kv): de layout koppelt de sleutels aan adres, label en icoon.
// ---------------------------------------------------------------------------

export const WERKRUIMTES = ["personeel", "rijschool", "horeca", "website"] as const;
export type Werkruimte = (typeof WERKRUIMTES)[number];
export const isWerkruimte = (s: unknown): s is Werkruimte => typeof s === "string" && (WERKRUIMTES as readonly string[]).includes(s);

export const WERKRUIMTE_INFO: Record<Werkruimte, { naam: string; uitleg: string }> = {
  personeel: { naam: "Personeel inhuren", uitleg: "Klussen plaatsen, flexkrachten inplannen, uren goedkeuren en facturen." },
  rijschool: { naam: "Rijschool", uitleg: "Lesagenda, leerlingen en tegoed, instructeurs, je website en je eigen app." },
  horeca: { naam: "Horeca", uitleg: "Reserveringen, menukaart, bestellen met QR, keukenscherm en takenlijsten." },
  website: { naam: "Website en webshop", uitleg: "Je website ontwerpen, producten verkopen en bestellingen afhandelen." },
};

/** Wat het bedrijf zelf koos. */
export interface WerkruimteKeuze {
  soort: Werkruimte;
  /** ook personeel inhuren: de personeelsfuncties staan dan volledig in het menu */
  ookPersoneel: boolean;
  at: string;
}

/** Een bewaarde keuze terug inlezen; alles wat niet klopt telt als "geen keuze". */
export function leesKeuze(json: unknown): WerkruimteKeuze | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!isWerkruimte(o.soort)) return null;
  return { soort: o.soort, ookPersoneel: o.ookPersoneel === true, at: typeof o.at === "string" ? o.at : "" };
}

export interface WerkruimteFeiten {
  keuze: WerkruimteKeuze | null;
  heeftRijschool: boolean;
  heeftHoreca: boolean;
  heeftSite: boolean;
  /** ooit een klus geplaatst */
  heeftKlussen: boolean;
  /** de horeca-module "Personeel via ZekerFlex" staat aan (lib/horeca/modules.ts) */
  personeelModule?: boolean;
}

export interface WerkruimteStand {
  soort: Werkruimte;
  /** de personeelsfuncties (klussen, kalender, uren …) volledig in het menu */
  ookPersoneel: boolean;
  /** door het bedrijf gekozen; anders afgeleid */
  gekozen: boolean;
}

export function bepaalWerkruimte(f: WerkruimteFeiten): WerkruimteStand {
  const gebruiktPersoneel = f.heeftKlussen || f.personeelModule === true;
  if (f.keuze) {
    const soort = f.keuze.soort;
    return { soort, ookPersoneel: soort === "personeel" || f.keuze.ookPersoneel || gebruiktPersoneel, gekozen: true };
  }
  const soort: Werkruimte = f.heeftRijschool
    ? "rijschool"
    : f.heeftHoreca
      ? "horeca"
      : f.heeftSite && !f.heeftKlussen
        ? "website"
        : "personeel";
  return { soort, ookPersoneel: soort === "personeel" || gebruiktPersoneel, gekozen: false };
}

// --- het menu ------------------------------------------------------------------

export type MenuSleutel =
  | "start"
  | "rijschool"
  | "horeca"
  | "studio"
  | "inhuren"
  | "klussen"
  | "kalender"
  | "agenda"
  | "bank"
  | "favorieten"
  | "berichten"
  | "mail"
  | "whatsapp"
  | "geblokkeerd"
  | "uren"
  | "facturen"
  | "compliance"
  | "overeenkomsten"
  | "bedrijf"
  | "website"
  | "telefonie"
  | "reviews";

export type MenuSectie = "beheer" | "klanten" | "administratie" | "personeel";

export const SECTIE_NAAM: Record<Exclude<MenuSectie, "beheer">, string> = {
  klanten: "Klanten en online",
  administratie: "Administratie",
  personeel: "Personeel inhuren",
};

export interface MenuPlek {
  sleutel: MenuSleutel;
  sectie?: MenuSectie;
}

export interface MenuOpties {
  ookPersoneel: boolean;
  heeftRijschool: boolean;
  heeftHoreca: boolean;
  /** Android-app: geen ZekerFlex Bank (lib/app-mode.ts) */
  inApp: boolean;
  /** mag de studio openen (HQ_ADMIN of PLATFORM_ADMIN, zoals app/studio/layout.tsx eist) */
  studio: boolean;
}

/** De personeelsfuncties, in de volgorde van het gewone menu. */
export const PERSONEEL_SLEUTELS: readonly MenuSleutel[] = ["klussen", "kalender", "uren", "favorieten", "geblokkeerd", "compliance", "overeenkomsten"];

const plek = (sectie?: MenuSectie) => (sleutel: MenuSleutel): MenuPlek => (sectie ? { sleutel, sectie } : { sleutel });

/** Het menu van /werkgever voor deze werkruimte. */
export function menuVoor(soort: Werkruimte, o: MenuOpties): MenuPlek[] {
  const bank: MenuSleutel[] = o.inApp ? [] : ["bank"];
  if (soort === "personeel") {
    // het gewone menu, precies zoals het altijd was
    return [
      { sleutel: "start" },
      ...(o.heeftHoreca ? [{ sleutel: "horeca" as const }] : []),
      ...(o.heeftRijschool ? [{ sleutel: "rijschool" as const }] : []),
      ...(["klussen", "kalender", "agenda", ...bank, "favorieten", "berichten", "mail", "whatsapp", "geblokkeerd"] as MenuSleutel[]).map(plek()),
      ...(["uren", "facturen", "compliance", "overeenkomsten", "bedrijf", "website", "telefonie", "reviews"] as MenuSleutel[]).map(plek("beheer")),
    ];
  }
  // het eigen onderdeel bovenaan, een ander pakket dat ook aanstaat erna
  const eigen: MenuSleutel[] =
    soort === "rijschool"
      ? ["rijschool", ...(o.heeftHoreca ? (["horeca"] as const) : [])]
      : soort === "horeca"
        ? ["horeca", ...(o.heeftRijschool ? (["rijschool"] as const) : [])]
        : [o.studio ? "studio" : "website", ...(o.heeftRijschool ? (["rijschool"] as const) : []), ...(o.heeftHoreca ? (["horeca"] as const) : [])];
  const klanten: MenuSleutel[] = [...(soort === "website" && !o.studio ? [] : (["website"] as const)), "reviews", "telefonie"];
  return [
    { sleutel: "start" },
    ...eigen.map(plek()),
    ...(["agenda", "berichten", "mail", "whatsapp"] as MenuSleutel[]).map(plek()),
    ...klanten.map(plek("klanten")),
    ...(["facturen", ...bank, "bedrijf"] as MenuSleutel[]).map(plek("administratie")),
    // geen klussen (nog)? Dan één ingang om er een te plaatsen
    ...(o.ookPersoneel ? PERSONEEL_SLEUTELS : (["inhuren"] as const)).map(plek("personeel")),
  ];
}
