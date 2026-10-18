import { alertOwnerLater } from "@/lib/ops/alert";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { getStripeClient } from "@/lib/billing/stripe";
import { exportPendingWithdrawals, listWithdrawals } from "@/lib/bank/withdrawals";
import { reviewAlert, scanAlerts } from "@/lib/bank/monitoring";
import { notifyBank } from "@/lib/bank/notify";

// ---------------------------------------------------------------------------
// The bank runs itself day to day; people only handle the exceptions.
//   1. SEPA batch: pending withdrawals are bundled into the day's pain.001
//      and finance gets a link — uploading it to the business bank is the one
//      step that stays manual until a bank API is connected.
//   2. Risk: a severe monitoring signal (≥ threshold, unreviewed) freezes the
//      account at once as a precaution and asks a human to decide.
//   3. Coverage: checks daily that Stripe holds at least what customers own,
//      and alerts finance the moment it doesn't.
//   key "bank-auto-risk"            → { enabled, thresholdCents }
//   key "bank-sepa-batch:<date>"    → { xml, count, totalCents, skipped }
//   key "bank-coverage-alert:<date>"→ sent marker
// ---------------------------------------------------------------------------

export interface AutoRiskSettings {
  enabled: boolean;
  thresholdCents: number;
}
export const DEFAULT_AUTO_RISK: AutoRiskSettings = { enabled: true, thresholdCents: 1_000_000 };
const SEVERE = new Set(["passthrough", "new_account_volume", "fan_in"]);

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const today = () => new Date().toISOString().slice(0, 10);

export async function getAutoRisk(): Promise<AutoRiskSettings> {
  return { ...DEFAULT_AUTO_RISK, ...((await kvGet<Partial<AutoRiskSettings>>("bank-auto-risk")) ?? {}) };
}
export async function setAutoRisk(s: AutoRiskSettings): Promise<AutoRiskSettings> {
  await kvSet("bank-auto-risk", s);
  return s;
}

/** 1 — bundle today's pending withdrawals and mail finance the download link. */
export async function autoSepaBatch(): Promise<{ count: number; totalCents: number } | null> {
  if (!env.SEPA_CREDITOR_IBAN || !env.SEPA_CREDITOR_NAME) return null;
  if ((await listWithdrawals({ status: ["pending"] })).length === 0) return null;
  const date = today();
  const batch = await exportPendingWithdrawals();
  const existing = await kvGet<{ xml: string; count: number; totalCents: number; skipped: string[] }>(`bank-sepa-batch:${date}`);
  // A second run on the same day adds a numbered file rather than overwriting.
  const key = existing ? `bank-sepa-batch:${date}-${Date.now().toString(36)}` : `bank-sepa-batch:${date}`;
  await kvSet(key, batch);
  const link = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/admin/bank/withdrawals?batch=${encodeURIComponent(key.slice("bank-sepa-batch:".length))}`;
  await sendMail({
    to: env.MAIL_ADMIN,
    subject: `ZekerFlex Bank: SEPA-batch klaar — ${batch.count} opname(s), ${euro(batch.totalCents)}`,
    text: `De opnames van vandaag staan klaar in één SEPA-bestand (pain.001).\n\nAantal: ${batch.count}\nTotaal: ${euro(batch.totalCents)}${batch.skipped.length ? `\nOvergeslagen: ${batch.skipped.join("; ")}` : ""}\n\n1. Download: ${link} (log in als platformbeheerder)\n2. Upload het bestand bij de zakelijke bank en keur het goed.\n3. Zet de opnames daarna op 'uitbetaald' in /admin/bank.`,
    kind: "bank-sepa-batch",
  }).catch((err) => logger.error("sepa batch mail failed", { error: (err as Error).message }));
  return { count: batch.count, totalCents: batch.totalCents };
}

/** 2 — freeze accounts with a severe, unreviewed signal as a precaution. */
export async function autoRisk(now = new Date()): Promise<{ frozen: number }> {
  const settings = await getAutoRisk();
  if (!settings.enabled) return { frozen: 0 };
  const severe = (await scanAlerts(now)).filter((a) => !a.reviewed && SEVERE.has(a.rule) && Math.abs(a.amountCents) >= settings.thresholdCents);
  let frozen = 0;
  for (const a of severe) {
    const reason = `Automatisch voorlopig geblokkeerd: ${a.title.toLowerCase()} (${a.detail}) — wacht op controle`;
    const updated = await prisma.bankAccount.updateMany({ where: { id: a.accountId, frozenAt: null }, data: { frozenAt: now, frozenReason: reason.slice(0, 200) } });
    await reviewAlert(a.id, "Automaat", updated.count ? "Rekening voorlopig geblokkeerd, wacht op menselijke controle" : "Rekening was al geblokkeerd");
    if (!updated.count) continue;
    frozen++;
    await recordAudit({ category: "ADMIN", action: "bank.account_auto_frozen", actorLabel: "system:bank-risk", severity: "warning", summary: `${a.holderName}: ${reason}`, targetType: "bank-account", targetId: a.accountId });
    await notifyBank(a.accountId, "security", "Je rekening is tijdelijk geblokkeerd", "We controleren een ongebruikelijke transactie. Je hoort zo snel mogelijk van ons; neem gerust contact op met Support.");
    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `ZekerFlex Bank: rekening automatisch geblokkeerd — ${a.holderName}`,
      text: `${reason}\nBedrag: ${euro(a.amountCents)}\n\nBeoordeel in /admin/bank → Transactiemonitoring en deblokkeer als alles in orde is.`,
      kind: "bank-risk",
    }).catch(() => undefined);
    alertOwnerLater({ key: `aml:${a.id}`, title: `Rekening automatisch geblokkeerd: ${a.holderName}`, detail: `${a.title} (${a.detail}). Beoordeel en deblokkeer als alles in orde is.`, url: "/admin/bank" });
  }
  return { frozen };
}

/** 3 — does Stripe hold at least what customers own? Alert finance once a day if not. */
export async function coverageCheck(): Promise<{ covered: boolean | null; shortfallCents: number }> {
  if (!env.STRIPE_SECRET_KEY) return { covered: null, shortfallCents: 0 };
  const [balances, pots, stripe] = await Promise.all([
    prisma.bankAccount.aggregate({ where: { ownerType: { not: "PLATFORM" } }, _sum: { balanceCents: true } }),
    prisma.bankPot.aggregate({ where: { closedAt: null }, _sum: { balanceCents: true } }),
    getStripeClient().balance.retrieve(),
  ]);
  const owed = (balances._sum.balanceCents ?? 0) + (pots._sum.balanceCents ?? 0);
  const held = [...stripe.available, ...stripe.pending].filter((b) => b.currency === "eur").reduce((s, b) => s + b.amount, 0);
  const shortfall = Math.max(0, owed - held);
  if (shortfall > 0 && !(await kvGet(`bank-coverage-alert:${today()}`))) {
    await kvSet(`bank-coverage-alert:${today()}`, true);
    alertOwnerLater({ key: "bank-coverage", title: `Geldtekort op Stripe: ${euro(shortfall)}`, detail: `Klanten hebben samen ${euro(owed)} tegoed, Stripe houdt ${euro(held)} aan. Vul aan of houd opnames tegen.`, url: "/admin/bank" });
    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `ZekerFlex Bank: tekort van ${euro(shortfall)} op Stripe`,
      text: `Klanten hebben samen ${euro(owed)} tegoed (incl. potjes), Stripe houdt ${euro(held)} aan. Tekort: ${euro(shortfall)}.\n\nVul het Stripe-saldo aan of houd opnames tegen tot dit klopt.`,
      kind: "bank-coverage",
    }).catch(() => undefined);
  }
  return { covered: shortfall === 0, shortfallCents: shortfall };
}
