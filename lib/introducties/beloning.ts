import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { kvSetIfAbsent } from "@/lib/storage/kv";
import { alleBeloningen, beloningSleutel, leesKoppeling, type IntroductieBeloning, type IntroductieKoppeling } from "@/lib/introducties/kv";
import { beloningTodoId, telVoorBeloning } from "@/lib/introducties/regels";

// ---------------------------------------------------------------------------
// De beloning van "Introduceer een bedrijf" (lib/introducties/regels.ts): zodra een voorgesteld en gekoppeld bedrijf zijn
// eerste factuur voor platformkosten betaalt, is € 50 bol-tegoed verschuldigd aan wie het voorstelde. ZekerFlex stuurt
// niets vanzelf: er komt een taak in Beheer → Te doen (lib/admin/todo-introductie.ts) en het afvinken daarvan is
// "beloning verstuurd". Aangeroepen vanuit de twee wegen waarop een factuur betaald wordt: de Stripe-webhook
// (markInvoicePaid) en "betaald per overschrijving" (lib/billing/overschrijving-betaald.ts); plus bij het koppelen, voor
// een bedrijf dat vóór het koppelen al een factuur betaalde. Eén keer per bedrijf (kvSetIfAbsent), dus Stripe die
// dubbel stuurt of een tweede factuur verandert niets.
// ---------------------------------------------------------------------------

export interface BetaaldeFactuur {
  id: string;
  number: string;
  type: string;
  totalCents: number;
  recipientTenantId?: string | null | undefined;
}

/** Zet de beloning één keer op verschuldigd; true als het nu gebeurde. */
export async function markeerBeloning(k: IntroductieKoppeling, f: BetaaldeFactuur, betaaldOp: Date): Promise<boolean> {
  const beloning: IntroductieBeloning = {
    tenantId: k.tenantId,
    introId: k.introId,
    userId: k.userId,
    bedrijf: k.bedrijf,
    factuurId: f.id,
    factuurNummer: f.number,
    betaaldOp: betaaldOp.toISOString(),
  };
  if (!(await kvSetIfAbsent(beloningSleutel(k.tenantId), beloning))) return false;
  await recordAudit({
    category: "SALES",
    action: "sales.introductie.beloning",
    actorLabel: "system:introductie",
    summary: `Introductie ${k.bedrijf}: eerste factuur voor platformkosten betaald (${f.number}), bol-tegoed verschuldigd`,
    targetType: "tenant",
    targetId: k.tenantId,
    metadata: { introId: k.introId, invoiceId: f.id, todoId: beloningTodoId(k.introId) },
  });
  return true;
}

/**
 * Een factuur staat net op betaald. Is het een factuur voor platformkosten met een bedrag, aan een bedrijf dat via een
 * introductie klant werd, en de eerste die telt, dan is de beloning verschuldigd. Gooit nooit: een betaling mag hier
 * niet op vastlopen.
 */
export async function beloonIntroductieNaBetaling(f: BetaaldeFactuur, nu: Date = new Date()): Promise<boolean> {
  try {
    if (!telVoorBeloning(f) || !f.recipientTenantId) return false;
    const k = await leesKoppeling(f.recipientTenantId);
    if (!k) return false;
    return await markeerBeloning(k, f, nu);
  } catch (err) {
    logger.warn("introductie: beloning na betaling niet vastgelegd", { invoiceId: f.id, error: (err as Error).message });
    return false;
  }
}

/** Een verschuldigde beloning voor de lijst in Beheer → Te doen. */
export interface BeloningRegel {
  introId: string;
  todoId: string;
  tenantId: string;
  bedrijf: string;
  /** wie het bol-tegoed krijgt */
  naam: string;
  email: string | null;
  factuurNummer: string;
  betaaldOp: string;
}

/** Alle verschuldigde beloningen, oudste betaling eerst, met naam en adres van wie het voorstelde. */
export async function verschuldigdeBeloningen(): Promise<BeloningRegel[]> {
  const lijst = await alleBeloningen();
  if (lijst.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(lijst.map((b) => b.userId))] } },
    select: { id: true, fullName: true, email: true },
  });
  const wie = new Map(users.map((u) => [u.id, u]));
  return lijst
    .map((b) => ({
      introId: b.introId,
      todoId: beloningTodoId(b.introId),
      tenantId: b.tenantId,
      bedrijf: b.bedrijf,
      naam: wie.get(b.userId)?.fullName ?? "een verwijderd account",
      email: wie.get(b.userId)?.email ?? null,
      factuurNummer: b.factuurNummer,
      betaaldOp: b.betaaldOp,
    }))
    .sort((a, b) => a.betaaldOp.localeCompare(b.betaaldOp));
}
