import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { kvGet, kvGetMany, kvSetIfAbsent, kvVervangAlsVeld } from "@/lib/storage/kv";
import { listCounterOffers } from "@/lib/offers/store";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { klusKenmerk, testklusMeldfilter } from "@/lib/shifts/testklus-db";
import {
  AFGEZEGD_DOOR_WERKER,
  bankHoortBij,
  legeReservebank,
  leesReservebank,
  metGemeld,
  metReserve,
  reservebankOpen,
  reservebankToegang,
  reservesVan,
  zonderReserve,
  type KlusVoorBank,
  type ReactieVoorBank,
  type Reservebank,
  type ReservebankToegang,
} from "@/lib/reservebank/kern";

// ---------------------------------------------------------------------------
// De reservebank per klus in de KV: "reservebank:<shiftId>" = { shiftId, tenantId, versie, reserves, gemeld }
// (regels in lib/reservebank/kern.ts). Geen migratie: een reserve is een gewone open reactie, de bank alleen de
// keuze van het bedrijf. Elke lees- en schrijfactie toetst de bank aan het bedrijf van de klus; een bank van een
// ander bedrijf telt niet. Schrijven gaat atomisch op de versie (twee planners tegelijk overschrijven elkaar niet).
// ---------------------------------------------------------------------------

export const reservebankSleutel = (shiftId: string) => `reservebank:${shiftId}`;

/** De versie zoals Postgres hem als tekst leest (value->>'versie'), voor het atomisch vervangen. */
function versieTekst(ruw: unknown): string | null {
  const v = ruw && typeof ruw === "object" ? (ruw as { versie?: unknown }).versie : undefined;
  return typeof v === "number" || typeof v === "string" ? String(v) : null;
}

/**
 * Lees, pas aan en schrijf terug, alleen als niemand er intussen aan zat (anders opnieuw). `pas` geeft null als er
 * niets verandert. Zonder `maakAan` blijft een klus zonder bank zonder bank. Geeft de opgeslagen bank, of null.
 */
async function pasAan(klus: { id: string; tenantId: string }, pas: (bank: Reservebank) => Reservebank | null, maakAan: boolean): Promise<Reservebank | null> {
  const sleutel = reservebankSleutel(klus.id);
  for (let poging = 0; poging < 4; poging += 1) {
    const ruw = await kvGet<unknown>(sleutel);
    const gelezen = leesReservebank(ruw);
    // een onleesbare rij of een bank van een ander bedrijf: daar bouwen we nooit op voort
    const geldig = bankHoortBij(gelezen, klus) ? gelezen : null;
    if (!geldig && !maakAan) return null;
    const nieuw = pas(geldig ?? legeReservebank(klus.id, klus.tenantId));
    if (!nieuw) return null;
    const opslaan: Reservebank = { ...nieuw, shiftId: klus.id, tenantId: klus.tenantId, versie: (geldig?.versie ?? 0) + 1 };
    const gelukt = ruw === null ? await kvSetIfAbsent(sleutel, opslaan) : await kvVervangAlsVeld(sleutel, "versie", versieTekst(ruw), opslaan);
    if (gelukt) return opslaan;
  }
  throw AppError.conflict("De reservebank werd net ook door iemand anders aangepast. Probeer het opnieuw.");
}

/** Zet een open reactie op de reservebank van haar klus (geen push: de werker ziet het alleen bij zijn reactie). */
export async function zetOpReservebank(klus: { id: string; tenantId: string }, offerId: string, nu = new Date()): Promise<void> {
  await pasAan(klus, (bank) => metReserve(bank, offerId, nu), true);
}

/** Haal een reactie van de reservebank (ook na accepteren of afwijzen; stond hij er niet op, dan gebeurt er niets). */
export async function haalVanReservebank(klus: { id: string; tenantId: string }, offerId: string): Promise<void> {
  await pasAan(klus, (bank) => zonderReserve(bank, offerId), false);
}

export interface ReservebankStand {
  toegang: ReservebankToegang;
  /** vóór de start van een klus die doorgaat: alleen dan telt de bank */
  open: boolean;
  /** de reacties die nu op de bank staan en nog openstaan, in de volgorde van de bank */
  reserveIds: string[];
  /** een aangenomen kracht zegde zelf af (cancelReason "Afgezegd door flexwerker…") */
  afzegging: boolean;
}

/** Wat de kluspagina van de werkgever nodig heeft. Een storing bij het lezen = een lege bank, de pagina blijft heel. */
export async function reservebankVoorPagina(
  grants: Parameters<typeof reservebankToegang>[0],
  klus: KlusVoorBank & { branchId: string },
  reacties: readonly ReactieVoorBank[],
  nu = new Date(),
): Promise<ReservebankStand> {
  const toegang = reservebankToegang(grants, klus);
  const open = reservebankOpen(klus, nu);
  if (!toegang || !open) return { toegang, open, reserveIds: [], afzegging: false };
  let reserveIds: string[] = [];
  try {
    reserveIds = reservesVan(leesReservebank(await kvGet<unknown>(reservebankSleutel(klus.id))), klus, reacties, nu);
  } catch {
    /* zonder bank verder */
  }
  const afzegging =
    reserveIds.length > 0 &&
    Boolean(
      await prisma.shiftAssignment
        .findFirst({ where: { shiftId: klus.id, cancelledAt: { not: null }, cancelReason: { startsWith: AFGEZEGD_DOOR_WERKER } }, select: { id: true } })
        .catch(() => null),
    );
  return { toegang, open, reserveIds, afzegging };
}

/**
 * Voor de werker: welke van zijn reacties staan op een reservebank ("Reserve: je bent nog niet ingepland"). Alleen
 * open reacties op klussen die nog niet begonnen; de klussen komen van de aanroeper (die heeft ze al). Een storing =
 * niemand is reserve (dan staat er gewoon "in afwachting").
 */
export async function reserveReactieIds(reacties: readonly ReactieVoorBank[], klussen: readonly KlusVoorBank[], nu: Date | number = Date.now()): Promise<Set<string>> {
  const uit = new Set<string>();
  const open = reacties.filter((r) => r.status === "pending");
  const perId = new Map(klussen.map((k) => [k.id, k]));
  const shiftIds = [...new Set(open.map((r) => r.shiftId))].filter((id) => perId.has(id));
  if (!shiftIds.length) return uit;
  try {
    const banken = await kvGetMany<unknown>(shiftIds.map(reservebankSleutel));
    for (const id of shiftIds) {
      const klus = perId.get(id);
      if (!klus) continue;
      for (const offerId of reservesVan(leesReservebank(banken.get(reservebankSleutel(id)) ?? null), klus, open, nu)) uit.add(offerId);
    }
  } catch {
    /* geen bank te lezen */
  }
  return uit;
}

/**
 * Een aangenomen kracht zegde af en de plek is weer vrij: één push aan de reserves van die klus, in hun eigen taal,
 * hooguit één keer per afzegging (de bank onthoudt de afzegging). Een testklus bereikt alleen interne accounts
 * (testklusMeldfilter), nooit echte werkers. Geeft het aantal beschikbare reserves (voor de push aan het bedrijf) en
 * hoeveel er een seintje kregen.
 */
export async function meldReservesVrijePlek(shiftId: string, assignmentId: string, nu = new Date()): Promise<{ reserves: number; gemeld: number }> {
  const geen = { reserves: 0, gemeld: 0 };
  const s = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      status: true,
      positions: true,
      createdAt: true,
      branch: { select: { tenantId: true, tenant: { select: { name: true } } } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!s) return geen;
  const klus: KlusVoorBank = { id: s.id, tenantId: s.branch.tenantId, startsAt: s.startsAt, status: s.status };
  if (!reservebankOpen(klus, nu) || s._count.assignments >= s.positions) return geen;
  const bank = leesReservebank(await kvGet<unknown>(reservebankSleutel(s.id)));
  if (!bankHoortBij(bank, klus) || !bank.reserves.length) return geen;

  const reacties = (await listCounterOffers(2000)).filter((o) => o.shiftId === s.id);
  const ids = new Set(reservesVan(bank, klus, reacties, nu));
  if (!ids.size) return geen;

  const testklus = await testklusMeldfilter();
  const kenmerk = klusKenmerk(s);
  const ontvangers: string[] = [];
  for (const o of reacties) {
    if (ids.has(o.id) && (await testklus.mag(kenmerk, o.userId))) ontvangers.push(o.userId);
  }
  if (!ontvangers.length) return { reserves: ids.size, gemeld: 0 };

  // wie de afzegging als eerste noteert, stuurt (ook als twee rondes tegelijk lopen); daarna nooit nog eens
  const genoteerd = await pasAan(klus, (b) => metGemeld(b, assignmentId), false).catch(() => null);
  if (!genoteerd) return { reserves: ids.size, gemeld: 0 };

  const tot = Math.round((s.startsAt.getTime() - nu.getTime()) / 1000);
  await sendLocalizedPush(ontvangers, (t) => ({
    title: t.reserveVrijTitle,
    body: t.reserveVrijBody(s.title),
    data: { type: "SHIFT", url: `/dashboard/klussen/${s.id}`, tag: `reserve-${s.id}` },
    ttlSeconds: Math.max(600, Math.min(43_200, tot)),
  }));
  return { reserves: ids.size, gemeld: ontvangers.length };
}
