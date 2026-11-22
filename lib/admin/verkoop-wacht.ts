import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Verkoop: wat wacht er op een mens? (14 nov 2026)
//
// Eén bron voor de tellingen die zowel Admin → Te doen (owner-todos.ts) als de
// kaart "Verkoop: dit wacht op jou" op het beheerstartscherm gebruiken: geen
// tweede waarheid. Alleen aantallen en het oudste aantal dagen, nooit namen of
// adressen. ZekerFlex verstuurt niets van dit alles vanzelf: concept-mails
// (REVIEW-modus) gaan pas weg als een mens op "Verstuur nu" drukt. De gratis
// scans en de websitevoorstellen zijn op 22 nov 2026 weggehaald (fase C).
// ---------------------------------------------------------------------------

const DAG = 86_400_000;

/** Een concept-mail telt als wachtend na zoveel dagen (de motor maakt ze dagelijks). */
export const CONCEPT_WACHT_DAGEN = 3;

export interface Wachtend {
  aantal: number;
  /** hoe lang het oudste al wacht, in hele dagen (0 als er niets wacht) */
  oudsteDagen: number;
}

const dagenGeleden = (at: number, now: number) => Math.floor((now - at) / DAG);
const samenvatten = (dagen: number[]): Wachtend => ({ aantal: dagen.length, oudsteDagen: dagen.length ? Math.max(...dagen) : 0 });

/**
 * Outreach-concepten die al CONCEPT_WACHT_DAGEN of langer op een mens wachten (status DRAFT of
 * APPROVED, lib/sales/outreach.ts). Alleen goedkeuren verstuurt niets; "Verstuur nu" wel. null = kon niet kijken.
 */
export async function wachtendeConcepten(now = Date.now()): Promise<Wachtend | null> {
  try {
    const rows = await prisma.salesOutreach.findMany({
      where: { status: { in: ["DRAFT", "APPROVED"] } },
      select: { createdAt: true },
    });
    return samenvatten(rows.map((r) => dagenGeleden(r.createdAt.getTime(), now)).filter((d) => d >= CONCEPT_WACHT_DAGEN));
  } catch {
    return null;
  }
}

/**
 * Warme leads zonder concept: een vacaturesignaal (careers-crawl) en een e-mailadres, nog niet
 * benaderd en zonder concept-mail. De motor schrijft daar bij de volgende ronde zelf een concept voor,
 * of een mens doet het via "Concept-mail schrijven". null = kon niet kijken.
 */
export async function warmeLeadsZonderConcept(now = Date.now()): Promise<Wachtend | null> {
  try {
    const rows = await prisma.salesLead.findMany({
      where: {
        vacancySignal: { not: null },
        suppressed: false,
        status: { in: ["NEW", "ENRICHED"] },
        OR: [{ contactEmail: { not: null } }, { discoveredEmail: { not: null } }],
        outreach: { none: {} },
      },
      select: { createdAt: true },
    });
    return samenvatten(rows.map((r) => dagenGeleden(r.createdAt.getTime(), now)));
  } catch {
    return null;
  }
}

export type VerkoopSoort = "concepten" | "warm";

export interface VerkoopItem {
  id: VerkoopSoort;
  label: string;
  aantal: number;
  oudsteDagen: number;
  /** waar de eigenaar het afhandelt: de juiste tab of het juiste filter */
  href: string;
  /** één zin: wat je daar doet */
  doen: string;
}

export interface VerkoopWacht {
  /** alleen soorten met iets te doen, de oudste eerst */
  items: VerkoopItem[];
  totaal: number;
  /** soorten die nu niet te lezen waren (nooit als 0 tonen) */
  onbekend: VerkoopSoort[];
}

export interface VerkoopStand {
  concepten: Wachtend | null;
  warm: Wachtend | null;
}

const SOORT: Record<VerkoopSoort, { label: (n: number) => string; href: string; doen: string }> = {
  concepten: {
    label: (n) => `${n} concept-mail${n === 1 ? "" : "s"}`,
    href: "/admin/sales?weergave=leads&filter=wacht",
    doen: "Lees het concept en kies 'Verstuur nu'; alleen goedkeuren verstuurt niets.",
  },
  warm: {
    label: (n) => `${n} warme lead${n === 1 ? "" : "s"} zonder concept`,
    href: "/admin/sales?weergave=leads&filter=ENRICHED",
    doen: "Open vacature en e-mailadres gevonden; kies 'Concept-mail schrijven' of wacht op de ronde van de motor.",
  },
};

/** Puur: van de tellingen naar de kaart. Soorten zonder werk vallen weg; onleesbare soorten staan apart. */
export function verkoopItems(stand: VerkoopStand): VerkoopWacht {
  const items: VerkoopItem[] = [];
  const onbekend: VerkoopSoort[] = [];
  const voeg = (id: VerkoopSoort, w: Wachtend | null | undefined) => {
    if (!w) {
      onbekend.push(id);
      return;
    }
    if (w.aantal <= 0) return;
    const s = SOORT[id];
    items.push({ id, label: s.label(w.aantal), aantal: w.aantal, oudsteDagen: w.oudsteDagen, href: s.href, doen: s.doen });
  };
  voeg("concepten", stand.concepten);
  voeg("warm", stand.warm);
  items.sort((a, b) => b.oudsteDagen - a.oudsteDagen || b.aantal - a.aantal);
  return { items, totaal: items.reduce((n, i) => n + i.aantal, 0), onbekend };
}

/** Alles in één keer, voor het beheerstartscherm. Een leesfout per soort houdt de rest niet tegen. */
export async function verkoopWacht(now = Date.now()): Promise<VerkoopWacht> {
  const [concepten, warm] = await Promise.all([wachtendeConcepten(now), warmeLeadsZonderConcept(now)]);
  return verkoopItems({ concepten, warm });
}
