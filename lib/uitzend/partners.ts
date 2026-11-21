import { kvGet, kvSet } from "@/lib/storage/kv";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { GEEN_PARTNERS, isUitzendPartner, leesUitzendPartnersWaarde, schakelUitzendPartner, type UitzendPartners } from "@/lib/uitzend/partners-kern";

// ---------------------------------------------------------------------------
// De set uitzendpartners (lib/uitzend/partners-kern.ts) in KV: één systeemsleutel met tenant-id's (een lijst van het beheer,
// geen gegevens over een persoon; valt onder "systeem:" in tests/kv-avg-bewaker.test.ts). Lezen gaat vaak (klussenlijst,
// kluspagina, reageren, uren goedkeuren), dus 60 seconden in het geheugen (globalThis: Next bundelt routes apart); schakelen
// wist die cache. Alleen het beheer schakelt (PLATFORM_ADMIN), altijd met een regel in de audit. Zelfde opzet als
// lib/admin/eigen-test.ts.
// ---------------------------------------------------------------------------

export const UITZENDPARTNERS_SLEUTEL = "systeem:uitzendpartners";
const CACHE_MS = 60_000;
const geheugen = globalThis as unknown as { __zfUitzendPartners?: { at: number; set: UitzendPartners } | undefined };

/** De set; een storing geeft een lege set (dan gedraagt alles zich zoals vóór de partners: ZekerFlex is de uitzender). */
export async function leesUitzendPartners(nu: number = Date.now()): Promise<UitzendPartners> {
  const c = geheugen.__zfUitzendPartners;
  if (c && nu - c.at >= 0 && nu - c.at < CACHE_MS) return c.set;
  try {
    const set = leesUitzendPartnersWaarde(await kvGet<unknown>(UITZENDPARTNERS_SLEUTEL));
    geheugen.__zfUitzendPartners = { at: nu, set };
    return set;
  } catch {
    return GEEN_PARTNERS;
  }
}

/** Is dit bedrijf uitzendpartner? Een storing zegt nee. */
export async function isUitzendPartnerTenant(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  return isUitzendPartner(await leesUitzendPartners(), tenantId);
}

/** Is deze klus van een uitzendpartner? Een storing (of een onbekende klus) zegt nee: dan gelden de strengere eisen van ZekerFlex. */
export async function isUitzendPartnerKlus(shiftId: string): Promise<boolean> {
  try {
    const klus = await prisma.shift.findUnique({ where: { id: shiftId }, select: { branch: { select: { tenantId: true } } } });
    return await isUitzendPartnerTenant(klus?.branch.tenantId);
  } catch {
    return false;
  }
}

/** Zet een bedrijf aan of uit als uitzendpartner, met een regel in de audit. */
export async function zetUitzendPartner(tenantId: string, aan: boolean, door: { userId: string }, nu: Date = new Date()): Promise<UitzendPartners> {
  const oud = leesUitzendPartnersWaarde(await kvGet<unknown>(UITZENDPARTNERS_SLEUTEL));
  const nieuw = schakelUitzendPartner(oud, tenantId, aan, nu);
  await kvSet(UITZENDPARTNERS_SLEUTEL, nieuw);
  geheugen.__zfUitzendPartners = undefined;
  await recordAudit({
    category: "ADMIN",
    action: aan ? "uitzendpartner.aan" : "uitzendpartner.uit",
    actorUserId: door.userId,
    actorLabel: "user",
    summary: aan ? "Bedrijf gemarkeerd als uitzendpartner (het bureau is werkgever bij zijn klussen)" : "Bedrijf is geen uitzendpartner meer",
    targetType: "tenant",
    targetId: tenantId,
  });
  return nieuw;
}
