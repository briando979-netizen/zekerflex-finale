// ---------------------------------------------------------------------------
// Het menu van de werkgevers-app (/werkgever).
//
// Van 10 tot 22 nov 2026 had een bedrijf meerdere dashboards: personeel, website, webshop, rijschool en horeca. Die
// andere dashboards zijn op 22 nov uit de code gehaald (fase C, eigenaar: "ruim op"; geen enkel echt bedrijf gebruikte
// ze). Elk bedrijf heeft nu alleen het dashboard personeel: klussen, uren, facturen en wat daarbij hoort.
// De soorten hieronder blijven alleen bestaan als wat een bedrijf ooit bij het aanmelden koos (KV "werkruimte:<tenantId>",
// lib/werkgever/werkruimte-server.ts); ze veranderen niets meer aan het menu.
// Puur (geen prisma of kv): de layout koppelt de sleutels aan adres, label en icoon.
// ---------------------------------------------------------------------------
import { BANK_AAN } from "@/lib/app-mode";

export const WERKRUIMTES = ["personeel", "rijschool", "horeca", "website", "webshop"] as const;
export type Werkruimte = (typeof WERKRUIMTES)[number];
export const isWerkruimte = (s: unknown): s is Werkruimte => typeof s === "string" && (WERKRUIMTES as readonly string[]).includes(s);

export const WERKRUIMTE_INFO: Record<Werkruimte, { naam: string; uitleg: string }> = {
  personeel: { naam: "Personeel inhuren", uitleg: "Klussen plaatsen, flexkrachten inplannen, uren goedkeuren en facturen." },
  rijschool: { naam: "Rijschool", uitleg: "Lesagenda, leerlingen en tegoed, instructeurs, je website en je eigen app." },
  horeca: { naam: "Horeca", uitleg: "Reserveringen, menukaart, bestellen met QR, keukenscherm en takenlijsten." },
  website: { naam: "Website", uitleg: "Je website ontwerpen, teksten en foto's aanpassen en online zetten." },
  webshop: { naam: "Webshop", uitleg: "Producten verkopen, bestellingen, verzending en betalen." },
};

/** Wat het bedrijf bij het aanmelden koos (alleen nog bewaard, zie boven). */
export interface WerkruimteKeuze {
  /** het dashboard waarmee het bedrijf wilde openen */
  soort: Werkruimte;
  /** ook personeel inhuren */
  ookPersoneel: boolean;
  /** de dashboards die het bedrijf zelf toevoegde */
  dashboards: Werkruimte[];
  at: string;
}

/** Een bewaarde keuze terug inlezen; alles wat niet klopt telt als "geen keuze". */
export function leesKeuze(json: unknown): WerkruimteKeuze | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!isWerkruimte(o.soort)) return null;
  const dashboards = Array.isArray(o.dashboards) ? WERKRUIMTES.filter((w) => (o.dashboards as unknown[]).includes(w)) : [];
  return { soort: o.soort, ookPersoneel: o.ookPersoneel === true, dashboards, at: typeof o.at === "string" ? o.at : "" };
}

/** Een dashboard toevoegen aan een (eventueel nog lege) keuze; het nieuwe wordt het standaarddashboard. */
export function voegToe(keuze: WerkruimteKeuze | null, soort: Werkruimte, at: string): WerkruimteKeuze {
  const lijst = new Set<Werkruimte>([...(keuze?.dashboards ?? []), ...(keuze ? [keuze.soort] : []), soort]);
  if (keuze?.ookPersoneel) lijst.add("personeel");
  return { soort, ookPersoneel: lijst.has("personeel"), dashboards: WERKRUIMTES.filter((w) => lijst.has(w)), at };
}

// --- het menu ------------------------------------------------------------------

export type MenuSleutel =
  | "start"
  | "klussen"
  | "kalender"
  | "week"
  | "planner"
  | "agenda"
  /** met de vlag publiek-alleen-flexwerk: samengevoegde ingangen (lib/werkgever/samen-tabs.ts): kalender+roosterplanner+agenda,
   *  favorieten+geblokkeerd; uren+inchecken en chat+assistent houden hun eerste sleutel; compliance/overeenkomsten/rapportages/inkaart/bedrijf vallen volledig weg */
  | "planning"
  | "werkers"
  | "regels"
  | "cijfers"
  | "bank"
  | "favorieten"
  | "berichten"
  | "geblokkeerd"
  | "uren"
  | "inchecken"
  | "facturen"
  | "compliance"
  | "overeenkomsten"
  | "bedrijf"
  /** de zakelijke nummers en de AI-beller (lib/telephony); blijft, ook al is het geen flexwerk (eigenaar, 22 nov 2026) */
  | "telefonie"
  | "rapportages"
  | "inkaart"
  | "kennisbank"
  | "hulp"
  | "assistent"
  /** het dashboard van een uitzendpartner (lib/uitzend/bureau-kern.ts): alleen als het bedrijf uitzendpartner is */
  | "uitzendAanvragen"
  | "uitzendKrachten"
  | "uitzendVerloning"
  | "uitzendKlanten"
  | "uitzendBureau";

export type MenuSectie = "beheer" | "uitzend";

export const SECTIE_NAAM: Record<Exclude<MenuSectie, "beheer">, string> = {
  uitzend: "Uitzendbureau",
};

/**
 * Het blok "Uitzendbureau" (21 nov 2026, eigenaar: "een aparte" voor de uitzendpartners): aanvragen, uitzendkrachten, uren
 * voor de verloning, klanten en locaties, bureaugegevens. Alleen bij een uitzendpartner, tussen het hoofddeel en Beheer.
 */
export const UITZEND_SLEUTELS: readonly MenuSleutel[] = ["uitzendAanvragen", "uitzendKrachten", "uitzendVerloning", "uitzendKlanten", "uitzendBureau"];

export interface MenuPlek {
  sleutel: MenuSleutel;
  sectie?: MenuSectie;
}

export interface MenuOpties {
  /** Android-app: geen ZekerFlex Bank (lib/app-mode.ts) */
  inApp: boolean;
  /** vlag `publiek-alleen-flexwerk`: dan vallen telefonie en de losse handleidingen weg en worden ingangen samengevoegd (zie onder) */
  alleenFlexwerk?: boolean;
  /** het bedrijf plaatste nog nooit een klus: met de vlag aan dan een kort startmenu (zie NA_EERSTE_KLUS) */
  nogGeenKlussen?: boolean;
  /** het bedrijf is uitzendpartner (lib/uitzend/partners.ts): dan het blok Uitzendbureau (UITZEND_SLEUTELS) */
  uitzendPartner?: boolean;
}

/** De personeelsfuncties, in de volgorde van het menu. */
export const PERSONEEL_SLEUTELS: readonly MenuSleutel[] = ["klussen", "kalender", "week", "planner", "uren", "inchecken", "favorieten", "geblokkeerd", "compliance", "overeenkomsten"];

const plek = (sectie?: MenuSectie) => (sleutel: MenuSleutel): MenuPlek => (sectie ? { sleutel, sectie } : { sleutel });

// Met de vlag `publiek-alleen-flexwerk` aan vallen Telefonie (geen flexwerk) en de losse ingang "Handleidingen" (Outline) weg:
// het hulpcentrum (vraagteken, menu-item Hulp) linkt naar de handleidingen. De pagina's blijven bereikbaar via een directe link.
const NIET_FLEXWERK_MENU: readonly MenuSleutel[] = ["telefonie", "kennisbank", "compliance", "overeenkomsten", "rapportages", "inkaart", "bedrijf"];

// Samenvoegen (20 nov, eigenaar: "voeg samen"): met de vlag aan worden kalender+roosterplanner+agenda één "Planning",
// uren+inchecken één "Uren", favorieten+geblokkeerd "Mijn werkers", compliance+overeenkomsten "Regels en overeenkomsten",
// rapportages+bedrijf-in-kaart "Cijfers" en chat+assistent "Chat"; bovenaan die pagina's staan dan tabbladen
// (lib/werkgever/samen-tabs.ts, components/werkgever/SamenTabs.tsx). De eerste van de leden bepaalt de plek in het menu.
export const SAMENVOEGINGEN: readonly { sleutel: MenuSleutel; leden: readonly MenuSleutel[] }[] = [
  { sleutel: "planning", leden: ["kalender", "week", "planner", "agenda"] },
  { sleutel: "uren", leden: ["uren", "inchecken"] },
  { sleutel: "werkers", leden: ["favorieten", "geblokkeerd"] },
  { sleutel: "regels", leden: ["compliance", "overeenkomsten"] },
  { sleutel: "cijfers", leden: ["rapportages", "inkaart"] },
  { sleutel: "berichten", leden: ["berichten", "assistent"] },
];
/** Voor de tests en de tabbladen: de leden van "Planning". */
export const PLANNING_SAMEN: readonly MenuSleutel[] = SAMENVOEGINGEN[0]!.leden;

// Een nieuw bedrijf zag 23 regels in het menu (20 nov, eigenaar: korter). Wat pas zin heeft als er een klus loopt, komt
// erbij zodra de eerste klus is geplaatst: wie klussen heeft, houdt altijd alle personeelsfuncties. Tot die tijd blijft
// over: start, klussen, planning, chat, assistent, uren, facturen, bedrijf en hulp. De pagina's blijven bereikbaar via een
// directe link.
export const NA_EERSTE_KLUS: readonly MenuSleutel[] = ["favorieten", "geblokkeerd", "inchecken", "rapportages", "inkaart", "compliance", "overeenkomsten"];

/** Het menu van de werkgevers-app; met de vlag aan vallen telefonie en de handleidingen weg en worden ingangen samengevoegd. */
export function menuVoor(o: MenuOpties): MenuPlek[] {
  const menu = menuVoorBasis(o);
  if (!o.alleenFlexwerk) return menu;
  const weg: readonly MenuSleutel[] = o.nogGeenKlussen ? [...NIET_FLEXWERK_MENU, ...NA_EERSTE_KLUS] : NIET_FLEXWERK_MENU;
  // samenvoegen: het eerste lid van een groep wordt de samengevoegde ingang, de andere leden vallen weg (tabbladen)
  const gezet = new Set<MenuSleutel>();
  return menu.flatMap((p): MenuPlek[] => {
    if (weg.includes(p.sleutel)) return [];
    const groep = SAMENVOEGINGEN.find((s) => s.leden.includes(p.sleutel));
    if (!groep) return [p];
    if (gezet.has(groep.sleutel)) return [];
    gezet.add(groep.sleutel);
    return [{ ...p, sleutel: groep.sleutel }];
  });
}

/** De vaste opbouw van het menu, zonder de vlag. */
function menuVoorBasis(o: MenuOpties): MenuPlek[] {
  // ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN)
  const bank: MenuSleutel[] = o.inApp || !BANK_AAN ? [] : ["bank"];
  return [
    { sleutel: "start" },
    ...(["klussen", "kalender", "week", "planner", "agenda", ...bank, "favorieten", "berichten", "assistent", "geblokkeerd"] as MenuSleutel[]).map(plek()),
    ...(o.uitzendPartner ? UITZEND_SLEUTELS.map(plek("uitzend")) : []),
    ...(["uren", "inchecken", "facturen", "rapportages", "inkaart", "compliance", "overeenkomsten", "bedrijf", "telefonie", "kennisbank", "hulp"] as MenuSleutel[]).map(plek("beheer")),
  ];
}
