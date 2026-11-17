// ---------------------------------------------------------------------------
// Reservebank (17 nov 2026, eigenaar: "altijd vervanging paraat"). Een bedrijf
// neemt de krachten aan die het wil en zet extra reacties op de reservebank in
// plaats van ze af te wijzen. Zegt een aangenomen kracht af, dan ziet het bedrijf
// meteen zijn reserves en plant er met één klik een in, via precies dezelfde weg
// als een gewone reactie accepteren (respondToOfferAction).
//
// Een reserve is een reactie (lib/offers/store.ts) die gewoon open blijft staan;
// de bank zelf is alleen een lijst reactie-id's per klus in de KV
// ("reservebank:<shiftId>", lib/reservebank/store.ts), met het bedrijf erbij.
// Geen namen of gebruikers-id's: wie het is staat in de reactie.
// Puur bestand: de pagina, de acties en de tests delen deze regels.
// ---------------------------------------------------------------------------

/** Meer reserves dan dit per klus heeft geen zin (en houdt de rij klein). */
export const RESERVEBANK_MAX = 50;
/** Zoveel afzeggingen onthoudt de bank (één seintje per afzegging). */
const GEMELD_MAX = 20;

export interface ReserveRegel {
  /** id van de reactie (CounterOffer.id) */
  offerId: string;
  /** wanneer hij op de bank kwam */
  at: string;
}

export interface Reservebank {
  shiftId: string;
  /** het bedrijf van de klus; een bank van een ander bedrijf telt niet */
  tenantId: string;
  /** teller voor het atomisch vervangen (kvVervangAlsVeld) */
  versie: number;
  reserves: ReserveRegel[];
  /** afzeggingen (assignment-id's) waarvoor de reserves al een seintje kregen */
  gemeld: string[];
}

export interface KlusVoorBank {
  id: string;
  tenantId: string;
  startsAt: Date;
  status: string;
}

/** Wat de bank van een reactie hoeft te weten. */
export interface ReactieVoorBank {
  id: string;
  shiftId: string;
  status: string;
}

export const legeReservebank = (shiftId: string, tenantId: string): Reservebank => ({ shiftId, tenantId, versie: 0, reserves: [], gemeld: [] });

const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Soepel inlezen: een onleesbare waarde is geen bank (null), een kapotte regel wordt overgeslagen en een dubbele
 * telt één keer. Zo laat één rare rij nooit de hele klus omvallen.
 */
export function leesReservebank(ruw: unknown): Reservebank | null {
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw)) return null;
  const r = ruw as Record<string, unknown>;
  const shiftId = tekst(r.shiftId);
  const tenantId = tekst(r.tenantId);
  if (!shiftId || !tenantId) return null;
  const versie = typeof r.versie === "number" && Number.isInteger(r.versie) && r.versie >= 0 ? r.versie : 0;
  const gezien = new Set<string>();
  const reserves: ReserveRegel[] = [];
  for (const regel of Array.isArray(r.reserves) ? r.reserves : []) {
    const offerId = tekst((regel as { offerId?: unknown } | null)?.offerId);
    if (!offerId || gezien.has(offerId)) continue;
    gezien.add(offerId);
    const at = tekst((regel as { at?: unknown }).at) ?? new Date(0).toISOString();
    reserves.push({ offerId, at });
  }
  const gemeld = (Array.isArray(r.gemeld) ? r.gemeld : []).map(tekst).filter((g): g is string => Boolean(g));
  return { shiftId, tenantId, versie, reserves: reserves.slice(0, RESERVEBANK_MAX), gemeld: [...new Set(gemeld)].slice(-GEMELD_MAX) };
}

/** Hoort deze bank echt bij deze klus van dit bedrijf? Anders telt hij niet (ook niet om te lezen). */
export function bankHoortBij(bank: Reservebank | null, klus: { id: string; tenantId: string }): bank is Reservebank {
  return bank !== null && bank.shiftId === klus.id && bank.tenantId === klus.tenantId;
}

/** De reservebank telt alleen vóór de start van een klus die nog doorgaat; daarna is hij zinloos. */
export function reservebankOpen(klus: { startsAt: Date; status: string }, nu: Date | number): boolean {
  const t = typeof nu === "number" ? nu : nu.getTime();
  if (klus.status === "CANCELLED" || klus.status === "COMPLETED" || klus.status === "IN_PROGRESS") return false;
  return t < klus.startsAt.getTime();
}

/**
 * De reserves die nu echt beschikbaar zijn, in de volgorde van de bank: alleen reacties op deze klus die nog
 * openstaan (niet geaccepteerd, afgewezen, ingetrokken of vervallen), en alleen vóór de start.
 */
export function reservesVan(bank: Reservebank | null, klus: KlusVoorBank, reacties: readonly ReactieVoorBank[], nu: Date | number): string[] {
  if (!bankHoortBij(bank, klus) || !reservebankOpen(klus, nu)) return [];
  const open = new Set(reacties.filter((r) => r.shiftId === klus.id && r.status === "pending").map((r) => r.id));
  return bank.reserves.filter((r) => open.has(r.offerId)).map((r) => r.offerId);
}

/** Bank met deze reactie erbij (null = er verandert niets: hij stond er al, of de bank is vol). */
export function metReserve(bank: Reservebank, offerId: string, nu: Date): Reservebank | null {
  if (bank.reserves.some((r) => r.offerId === offerId) || bank.reserves.length >= RESERVEBANK_MAX) return null;
  return { ...bank, reserves: [...bank.reserves, { offerId, at: nu.toISOString() }] };
}

/** Bank zonder deze reactie (null = hij stond er niet op). */
export function zonderReserve(bank: Reservebank, offerId: string): Reservebank | null {
  if (!bank.reserves.some((r) => r.offerId === offerId)) return null;
  return { ...bank, reserves: bank.reserves.filter((r) => r.offerId !== offerId) };
}

/** Bank waarin deze afzegging als gemeld staat (null = al gemeld: geen tweede seintje). */
export function metGemeld(bank: Reservebank, assignmentId: string): Reservebank | null {
  if (bank.gemeld.includes(assignmentId)) return null;
  return { ...bank, gemeld: [...bank.gemeld, assignmentId].slice(-GEMELD_MAX) };
}

export type ReservebankToegang = "schrijven" | "lezen" | null;

interface RolVoorBank {
  role: string;
  organizationId: string;
  /** leeg = elke vestiging van de organisatie */
  locationIds: string[];
}

/**
 * Wie mag de reservebank van een klus zien of aanpassen. Aanpassen: alleen het bedrijf zelf (HQ_ADMIN, of een
 * LOCAL_MANAGER van die vestiging). Lezen: ook een ander lid van dat bedrijf voor die vestiging, en het beheer
 * van ZekerFlex (PLATFORM_ADMIN). Iedereen anders: niets.
 */
export function reservebankToegang(grants: readonly RolVoorBank[], klus: { tenantId: string; branchId: string }): ReservebankToegang {
  const dekt = (g: RolVoorBank) => g.organizationId === klus.tenantId && (g.locationIds.length === 0 || g.locationIds.includes(klus.branchId));
  if (grants.some((g) => (g.role === "HQ_ADMIN" && g.organizationId === klus.tenantId) || (g.role === "LOCAL_MANAGER" && dekt(g)))) return "schrijven";
  if (grants.some((g) => g.role === "PLATFORM_ADMIN" || dekt(g))) return "lezen";
  return null;
}

/** Het begin van cancelReason bij een afzegging door de werker zelf (app/api/me/assignments/[assignmentId]/cancel). */
export const AFGEZEGD_DOOR_WERKER = "Afgezegd door flexwerker";
