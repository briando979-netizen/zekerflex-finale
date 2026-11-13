import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// De AI-gebruikslog (AiUsageLog) opruimen (13 nov 2026, db-groei-ronde). Gemeten: ±15.000 rijen per maand en groeiend
// (36 → 627 → 6.449 per maand), zonder enige opruiming. Gelezen wordt alleen "vandaag" (het AI-budget, Beheer) en de
// laatste 15 rijen, dus een termijn van 90 dagen verliest niets. Geen persoonsgegevens (doel, model, tokens, duur), dus
// buiten lib/privacy. Elke dag mee met de AI-watchdog (cron 07:00), begrensd per keer; ?droog=1 telt alleen.
// ---------------------------------------------------------------------------

export const AI_GEBRUIK_DAGEN = 90;
export const AI_GEBRUIK_PER_KEER = 20_000;

export function aiGebruikGrens(nu: Date): Date {
  return new Date(nu.getTime() - AI_GEBRUIK_DAGEN * 86_400_000);
}

/** Rijen ouder dan 90 dagen weg, hooguit `max` per keer (de oudste eerst). Met `droog` alleen tellen. */
export async function ruimAiGebruikOp(opts: { nu?: Date; droog?: boolean; max?: number } = {}): Promise<{ oud: number; verwijderd: number }> {
  const grens = aiGebruikGrens(opts.nu ?? new Date());
  const oud = await prisma.aiUsageLog.count({ where: { createdAt: { lt: grens } } });
  if (opts.droog || oud === 0) return { oud, verwijderd: 0 };
  const ids = await prisma.aiUsageLog.findMany({
    where: { createdAt: { lt: grens } },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, opts.max ?? AI_GEBRUIK_PER_KEER),
    select: { id: true },
  });
  if (ids.length === 0) return { oud, verwijderd: 0 };
  const { count } = await prisma.aiUsageLog.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
  return { oud, verwijderd: count };
}
