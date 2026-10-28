import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Snelle uitbetaling (direct indienen / binnen 3 werkdagen) is factoring: ZekerFlex buys the
// worker's invoice and carries the risk that the client pays. So:
//   - a client only offers it after a credit check (payment record on
//     ZekerFlex + Handelsregister status). Clear cases are decided
//     automatically; borderline ones go to an admin.
//   - the client switches it on itself, and separately whether uitzend-
//     krachten get an instant advance on approval.
//   - a worker must accept the overdrachtsvoorwaarden (assignment of the
//     claim) before picking a fast speed.
//   key "fastpay:<tenantId>"          → FastPaySettings
//   key "factoring-terms:<userId>"    → TermsAcceptance
// ---------------------------------------------------------------------------

export const FACTORING_TERMS_VERSION = "2026-11";

export type CreditStatus = "none" | "approved" | "review" | "rejected";

export interface CreditCheck {
  status: CreditStatus;
  score: number;
  reasons: string[];
  checkedAt: string;
  decidedBy?: string;
}

export interface FastPaySettings {
  offerFastPay: boolean;
  /** uitzendkrachten get ~50% advance on approval (existing behaviour = on) */
  advancesForUitzend: boolean;
  credit: CreditCheck;
}

export const DEFAULT_FASTPAY: FastPaySettings = {
  offerFastPay: false,
  advancesForUitzend: true,
  credit: { status: "none", score: 0, reasons: [], checkedAt: new Date(0).toISOString() },
};

const key = (tenantId: string) => `fastpay:${tenantId}`;

export async function getFastPay(tenantId: string): Promise<FastPaySettings> {
  const s = await kvGet<Partial<FastPaySettings>>(key(tenantId));
  return { ...DEFAULT_FASTPAY, ...(s ?? {}), credit: { ...DEFAULT_FASTPAY.credit, ...(s?.credit ?? {}) } };
}

async function save(tenantId: string, s: FastPaySettings): Promise<FastPaySettings> {
  await kvSet(key(tenantId), s);
  return s;
}

/** Can a worker choose 1-minute / 3-day payout for this client's klussen? */
export function fastPayAvailable(s: FastPaySettings): boolean {
  return s.offerFastPay && s.credit.status === "approved";
}

export async function fastPayAvailableFor(tenantIds: string[]): Promise<Map<string, boolean>> {
  const ids = [...new Set(tenantIds)];
  const out = new Map<string, boolean>();
  await Promise.all(ids.map(async (id) => out.set(id, fastPayAvailable(await getFastPay(id)))));
  return out;
}

/**
 * Credit check from what we can verify: Handelsregister status and how this
 * client has paid ZekerFlex invoices. ≥ 65 approved, 45–64 to an admin,
 * < 45 or insolvent rejected.
 */
export async function runCreditCheck(tenantId: string, now = new Date()): Promise<CreditCheck> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { kvkNumber: true, companyRegistration: { select: { isActive: true, insolvent: true, status: true } } },
  });
  const invoices = await prisma.invoice.findMany({
    where: { recipientTenantId: tenantId, status: { in: ["ISSUED", "PAID"] } },
    select: { status: true, dueAt: true, paidAt: true, createdAt: true },
    take: 2000,
  });
  const reasons: string[] = [];
  let score = 50;
  const reg = tenant?.companyRegistration;
  if (reg?.insolvent) {
    return { status: "rejected", score: 0, reasons: ["Faillissement of surseance volgens het Handelsregister"], checkedAt: now.toISOString() };
  }
  if (tenant?.kvkNumber && reg?.isActive) {
    score += 15;
    reasons.push("Actief ingeschreven bij de KVK (+15)");
  } else {
    score -= 10;
    reasons.push("KVK-inschrijving niet bevestigd (−10)");
  }
  const paid = invoices.filter((i) => i.status === "PAID");
  const onTime = paid.filter((i) => !i.dueAt || (i.paidAt && i.paidAt <= new Date(i.dueAt.getTime() + 3 * 86_400_000)));
  const overdue = invoices.filter((i) => i.status === "ISSUED" && i.dueAt && i.dueAt < now);
  const longOverdue = overdue.filter((i) => now.getTime() - i.dueAt!.getTime() > 60 * 86_400_000);
  if (longOverdue.length) {
    return { status: "rejected", score: Math.max(0, score - 40), reasons: [...reasons, `${longOverdue.length} factuur/facturen meer dan 60 dagen over de vervaldatum`], checkedAt: now.toISOString() };
  }
  if (paid.length >= 5) {
    score += 10;
    reasons.push(`${paid.length} facturen betaald (+10)`);
  } else {
    reasons.push(`Nog weinig betaalhistorie (${paid.length} betaald)`);
  }
  if (paid.length && onTime.length / paid.length >= 0.9) {
    score += 15;
    reasons.push("Betaalt ≥ 90% op tijd (+15)");
  } else if (paid.length) {
    score -= 10;
    reasons.push(`Betaalt ${Math.round((onTime.length / paid.length) * 100)}% op tijd (−10)`);
  }
  if (overdue.length) {
    const minus = Math.min(30, overdue.length * 10);
    score -= minus;
    reasons.push(`${overdue.length} openstaande factuur/facturen over de vervaldatum (−${minus})`);
  }
  const first = invoices.reduce<Date | null>((m, i) => (!m || i.createdAt < m ? i.createdAt : m), null);
  if (first && now.getTime() - first.getTime() > 180 * 86_400_000) {
    score += 10;
    reasons.push("Langer dan 6 maanden klant (+10)");
  }
  score = Math.max(0, Math.min(100, score));
  let status: CreditStatus = score >= 65 ? "approved" : score >= 45 ? "review" : "rejected";
  // Without a payment record there's nothing to base factoring risk on — a
  // human decides, however good the Handelsregister data looks.
  if (status === "approved" && paid.length < 3) {
    status = "review";
    reasons.push("Minder dan 3 betaalde facturen: beoordeling door ZekerFlex");
  }
  return { status, score, reasons, checkedAt: now.toISOString() };
}

/** Employer settings: switching fast payout on (re)runs the credit check. */
export async function updateFastPay(tenantId: string, patch: { offerFastPay?: boolean | undefined; advancesForUitzend?: boolean | undefined }): Promise<FastPaySettings> {
  const s = await getFastPay(tenantId);
  const next: FastPaySettings = {
    ...s,
    ...(patch.offerFastPay !== undefined ? { offerFastPay: patch.offerFastPay } : {}),
    ...(patch.advancesForUitzend !== undefined ? { advancesForUitzend: patch.advancesForUitzend } : {}),
  };
  const stale = Date.now() - new Date(s.credit.checkedAt).getTime() > 30 * 86_400_000;
  if (patch.offerFastPay && (s.credit.status === "none" || (stale && s.credit.status !== "approved") || (stale && !s.credit.decidedBy))) {
    next.credit = await runCreditCheck(tenantId);
  }
  return save(tenantId, next);
}

/** Admin decision on a borderline ("review") or re-assessed client. */
export async function decideCredit(tenantId: string, status: "approved" | "rejected", by: string, note: string): Promise<FastPaySettings> {
  const s = await getFastPay(tenantId);
  return save(tenantId, { ...s, credit: { ...s.credit, status, decidedBy: by, reasons: [...s.credit.reasons, `Beoordeeld door ${by}: ${note}`], checkedAt: new Date().toISOString() } });
}

export interface TermsAcceptance {
  version: string;
  acceptedAt: string;
  ip: string;
  userAgent: string;
}

export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  return (await kvGet<TermsAcceptance>(`factoring-terms:${userId}`))?.version === FACTORING_TERMS_VERSION;
}

export async function acceptTerms(userId: string, ip: string, userAgent: string): Promise<void> {
  await kvSet(`factoring-terms:${userId}`, { version: FACTORING_TERMS_VERSION, acceptedAt: new Date().toISOString(), ip, userAgent: userAgent.slice(0, 200) } satisfies TermsAcceptance);
}
