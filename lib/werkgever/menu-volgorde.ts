import type { MenuPlek, MenuSleutel } from "@/lib/werkgever/werkruimte";

// ---------------------------------------------------------------------------
// De volgorde van het werkgeversmenu (13 nov 2026, eigenaar: "alles moet ik kunnen verslepen"). In de Site-ontwerper
// (tabblad Menu, "Menu van de werkgevers-app") versleept de beheerder de onderdelen van het dashboard personeel: het
// bovenste deel en het deel onder "Beheer". Het geldt voor alle werkgevers.
// Alleen de volgorde: er verdwijnt niets (wie klussen heeft, houdt alle personeelsfuncties) en niets wisselt van deel.
// Wélke onderdelen een bedrijf ziet, bepaalt nog steeds menuVoor() in lib/werkgever/werkruimte.ts.
// Puur bestand; de opslag staat in lib/werkgever/menu-volgorde-store.ts. Zonder eigen volgorde blijft het menu exact zoals het was.
// ---------------------------------------------------------------------------

export type MenuDeel = "hoofd" | "beheer";

/** Het bovenste deel van het menu van het dashboard personeel, in de oorspronkelijke volgorde ("Jouw start" staat er altijd boven). */
export const HOOFD_STANDAARD: readonly MenuSleutel[] = ["klussen", "kalender", "planner", "agenda", "afspraken", "klanten", "bank", "favorieten", "berichten", "assistent", "mail", "whatsapp", "geblokkeerd"];

/** Het deel onder "Beheer", in de oorspronkelijke volgorde. */
export const BEHEER_STANDAARD: readonly MenuSleutel[] = ["uren", "inchecken", "facturen", "rapportages", "compliance", "overeenkomsten", "bedrijf", "telefonie", "reviews", "netwerk", "locatie", "branche", "kennisbank"];

const STANDAARD: Record<MenuDeel, readonly MenuSleutel[]> = { hoofd: HOOFD_STANDAARD, beheer: BEHEER_STANDAARD };

/** De naam van elk onderdeel zoals de werkgever hem ziet, met wanneer het in het menu staat als dat niet altijd is. */
export const MENU_NAAM: Partial<Record<MenuSleutel, { naam: string; wanneer?: string }>> = {
  klussen: { naam: "Klussen" },
  kalender: { naam: "Kalender" },
  planner: { naam: "Roosterplanner" },
  agenda: { naam: "Agenda" },
  afspraken: { naam: "Afspraken", wanneer: "Alleen bij bedrijven die afspraken hebben ingericht." },
  klanten: { naam: "Klantenkaart", wanneer: "Alleen bij bedrijven die afspraken hebben ingericht." },
  bank: { naam: "ZekerFlex Bank", wanneer: "Staat nu uit en is dus niet zichtbaar." },
  favorieten: { naam: "Favorieten" },
  berichten: { naam: "Chat" },
  assistent: { naam: "Assistent" },
  mail: { naam: "Mail" },
  whatsapp: { naam: "WhatsApp" },
  geblokkeerd: { naam: "Geblokkeerd" },
  uren: { naam: "Uren goedkeuren" },
  inchecken: { naam: "Inchecken op locatie" },
  facturen: { naam: "Facturen" },
  rapportages: { naam: "Rapportages" },
  compliance: { naam: "Compliance" },
  overeenkomsten: { naam: "Modelovereenkomsten" },
  bedrijf: { naam: "Bedrijfsprofiel" },
  telefonie: { naam: "Telefonie" },
  reviews: { naam: "Google-reviews" },
  netwerk: { naam: "Wifi en VPN", wanneer: "Alleen als de netwerkpakketten aan staan." },
  locatie: { naam: "Op locatie", wanneer: "Alleen als de modules voor op locatie aan staan." },
  branche: { naam: "Jouw branche" },
  kennisbank: { naam: "Handleidingen", wanneer: "Alleen als de kennisbank is ingesteld." },
};

export interface MenuVolgorde {
  hoofd: MenuSleutel[];
  beheer: MenuSleutel[];
}

export const standaardMenuVolgorde = (): MenuVolgorde => ({ hoofd: [...HOOFD_STANDAARD], beheer: [...BEHEER_STANDAARD] });

function deel(raw: unknown, bekend: readonly MenuSleutel[]): MenuSleutel[] {
  const uit: MenuSleutel[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const s = bekend.find((b) => b === v);
    if (s && !uit.includes(s)) uit.push(s);
  }
  // wat ontbreekt (bijvoorbeeld een nieuw onderdeel dat er bij het bewaren nog niet was) komt achteraan
  for (const s of bekend) if (!uit.includes(s)) uit.push(s);
  return uit;
}

/** Maakt van ongecontroleerde invoer een nette volgorde: onbekende en dubbele onderdelen vallen weg, niets wisselt van deel. */
export function normalizeMenuVolgorde(raw: unknown): MenuVolgorde {
  const o = raw && typeof raw === "object" ? (raw as { hoofd?: unknown; beheer?: unknown }) : {};
  return { hoofd: deel(o.hoofd, HOOFD_STANDAARD), beheer: deel(o.beheer, BEHEER_STANDAARD) };
}

export function isStandaardMenuVolgorde(v: MenuVolgorde): boolean {
  const n = normalizeMenuVolgorde(v);
  return (["hoofd", "beheer"] as const).every((d) => n[d].every((s, i) => s === STANDAARD[d][i]));
}

/**
 * Zet het menu van het dashboard personeel in de gekozen volgorde. null = het menu ongewijzigd terug (hetzelfde object).
 * "Jouw start" blijft bovenaan, daarna het bovenste deel, daarna Beheer; een onderdeel dat de volgorde niet kent, houdt zijn plek achteraan zijn deel.
 */
export function pasMenuVolgordeToe(menu: MenuPlek[], volgorde: MenuVolgorde | null): MenuPlek[] {
  if (!volgorde) return menu;
  const n = normalizeMenuVolgorde(volgorde);
  const gesorteerd = (plekken: MenuPlek[], lijst: MenuSleutel[]) => {
    const rang = (p: MenuPlek, i: number) => {
      const r = lijst.indexOf(p.sleutel);
      return r < 0 ? lijst.length + i : r;
    };
    return plekken.map((p, i) => ({ p, r: rang(p, i) })).sort((a, b) => a.r - b.r).map((x) => x.p);
  };
  const start = menu.filter((p) => !p.sectie && p.sleutel === "start");
  const hoofd = menu.filter((p) => !p.sectie && p.sleutel !== "start");
  const beheer = menu.filter((p) => p.sectie === "beheer");
  const rest = menu.filter((p) => p.sectie && p.sectie !== "beheer");
  return [...start, ...gesorteerd(hoofd, n.hoofd), ...gesorteerd(beheer, n.beheer), ...rest];
}
