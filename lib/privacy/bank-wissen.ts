// ---------------------------------------------------------------------------
// De ZekerFlex-bankrekening van een gewiste gebruiker (12 nov 2026). Gemeten: de bank staat uit, maar er stonden 31
// USER-rekeningen, waarvan 8 bij een gewist of ontbrekend account, alle 8 nog met de naam in holderName. anonymize.ts
// raakte BankAccount niet (userId heeft geen FK, dus geen cascade).
//  - Een lege rekening (saldo 0, geen boekingen) gaat helemaal weg; boekingen, passen en potjes gaan mee (cascade).
//  - Heeft hij boekingen, dan blijft de financiële geschiedenis (bewaarplicht); naam, uitbetaal-IBAN en uitbetaalnaam
//    gaan eruit en de rekening wordt bevroren.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { ERASED_EMAIL_DOMAIN } from "@/lib/privacy/gewist";

export const GEWIST_HOUDER = "Gewist account";

type Uitkomst = "geen" | "verwijderd" | "geanonimiseerd";

/** De rekening van één rekening-id leegmaken volgens de regel hierboven. */
async function wisRekening(id: string, nu: Date): Promise<Uitkomst> {
  const r = await prisma.bankAccount.findUnique({
    where: { id },
    select: { id: true, balanceCents: true, holderName: true, payoutIban: true, payoutName: true, _count: { select: { entries: true } } },
  });
  if (!r) return "geen";
  if (r.balanceCents === 0 && r._count.entries === 0) {
    await prisma.bankAccount.delete({ where: { id: r.id } });
    return "verwijderd";
  }
  if (r.holderName === GEWIST_HOUDER && r.payoutIban === null && r.payoutName === null) return "geen";
  await prisma.bankAccount.update({
    where: { id: r.id },
    data: { holderName: GEWIST_HOUDER, payoutIban: null, payoutName: null, frozenAt: nu, frozenReason: "account gewist (AVG)" },
  });
  return "geanonimiseerd";
}

/** Bij het wissen van een account (anonymize.ts): zijn eigen bankrekening, als hij er een had. */
export async function wisBankrekeningVan(userId: string, nu: Date = new Date()): Promise<Uitkomst> {
  const r = await prisma.bankAccount.findUnique({ where: { userId }, select: { id: true } });
  return r ? wisRekening(r.id, nu) : "geen";
}

/**
 * Nachtelijke opruiming (sweep.ts): USER-rekeningen van een account dat er niet meer is of al gewist is, en die nog
 * persoonsgegevens dragen. `dryRun` telt alleen.
 */
export async function ruimWeesrekeningenOp(opts: { dryRun: boolean; nu?: Date }): Promise<number> {
  const nu = opts.nu ?? new Date();
  const rekeningen = await prisma.bankAccount.findMany({
    where: { ownerType: "USER", userId: { not: null } },
    select: { id: true, userId: true, holderName: true, payoutIban: true, payoutName: true },
  });
  const ids = rekeningen.map((r) => r.userId).filter((id): id is string => id !== null);
  if (ids.length === 0) return 0;
  const bestaand = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
  const levend = new Set(bestaand.filter((u) => !u.email.endsWith(`@${ERASED_EMAIL_DOMAIN}`)).map((u) => u.id));
  const wezen = rekeningen.filter(
    (r) => r.userId !== null && !levend.has(r.userId) && !(r.holderName === GEWIST_HOUDER && r.payoutIban === null && r.payoutName === null),
  );
  if (opts.dryRun) return wezen.length;
  let n = 0;
  for (const r of wezen) if ((await wisRekening(r.id, nu)) !== "geen") n += 1;
  return n;
}
