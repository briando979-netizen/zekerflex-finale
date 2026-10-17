import { randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { platformAccount } from "@/lib/bank/accounts";
import { transfer } from "@/lib/bank/ledger";

// ---------------------------------------------------------------------------
// Insurance through ZekerFlex Bank. ZekerFlex doesn't carry the risk itself:
// every product names the insurer that does, and a product can only be
// switched on once that insurer is filled in (/admin/bank). A holder
// requests a policy, the admin confirms it with the insurer and activates
// it; from then the monthly premium is collected from the balance (first
// one at activation, then by the daily cron). Missed premium → "arrears",
// retried daily, shown to the admin.
//   key "bank-ins-products"      → InsuranceProduct[]
//   key "bank-ins-policy:<id>"   → Policy
// ---------------------------------------------------------------------------

export type Audience = "personal" | "organisation" | "all";

export interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  coverage: string;
  insurer: string;
  monthlyPremiumCents: number;
  audience: Audience;
  active: boolean;
}

export type PolicyStatus = "requested" | "active" | "rejected" | "cancelled";

export interface Policy {
  id: string;
  accountId: string;
  holderName: string;
  userId: string;
  productId: string;
  productName: string;
  insurer: string;
  premiumCents: number;
  status: PolicyStatus;
  requestedAt: string;
  activatedAt?: string;
  cancelledAt?: string;
  nextPremiumAt?: string;
  arrears?: boolean;
  policyNumber?: string;
  note?: string;
}

const PRODUCTS_KEY = "bank-ins-products";
const policyKey = (id: string) => `bank-ins-policy:${id}`;

// Starting catalogue — all OFF until the admin links a real insurer.
export const DEFAULT_PRODUCTS: InsuranceProduct[] = [
  { id: "aov", name: "Arbeidsongeschiktheid (AOV)", description: "Inkomen als je door ziekte of een ongeval niet kunt werken.", coverage: "Maandelijkse uitkering tot 80% van je inkomen na de wachttijd.", insurer: "", monthlyPremiumCents: 9900, audience: "personal", active: false },
  { id: "avb", name: "Aansprakelijkheid (AVB/BAV)", description: "Schade die je tijdens een klus bij een ander veroorzaakt.", coverage: "Tot € 2.500.000 per aanspraak.", insurer: "", monthlyPremiumCents: 1495, audience: "all", active: false },
  { id: "ongevallen", name: "Ongevallen", description: "Uitkering bij blijvende invaliditeit of overlijden door een ongeval tijdens werk.", coverage: "Eenmalige uitkering tot € 100.000.", insurer: "", monthlyPremiumCents: 595, audience: "personal", active: false },
  { id: "rechtsbijstand", name: "Rechtsbijstand zakelijk", description: "Juridische hulp bij een conflict met een opdrachtgever of over je uren.", coverage: "Advies en procederen, onbeperkt externe kosten tot € 50.000.", insurer: "", monthlyPremiumCents: 1895, audience: "all", active: false },
  { id: "gereedschap", name: "Gereedschap & spullen", description: "Diefstal of schade van je werkspullen, ook onderweg.", coverage: "Tot € 5.000 per jaar, eigen risico € 100.", insurer: "", monthlyPremiumCents: 795, audience: "personal", active: false },
  { id: "verzuim", name: "Verzuim personeel", description: "Loondoorbetaling bij ziekte van je eigen medewerkers.", coverage: "Tot 100% loondoorbetaling, 2 jaar.", insurer: "", monthlyPremiumCents: 4900, audience: "organisation", active: false },
];

export async function getProducts(): Promise<InsuranceProduct[]> {
  return (await kvGet<InsuranceProduct[]>(PRODUCTS_KEY)) ?? DEFAULT_PRODUCTS;
}

export async function saveProducts(products: InsuranceProduct[]): Promise<InsuranceProduct[]> {
  for (const p of products) {
    if (p.active && !p.insurer.trim()) throw AppError.validation(`"${p.name}" kan pas aan als de verzekeraar is ingevuld`);
  }
  await kvSet(PRODUCTS_KEY, products);
  return products;
}

export function productsFor(products: InsuranceProduct[], role: "personal" | "organisation"): InsuranceProduct[] {
  return products.filter((p) => p.active && (p.audience === "all" || p.audience === role));
}

export async function listPolicies(filter?: { accountId?: string }): Promise<Policy[]> {
  const rows = await kvListValues<Policy>("bank-ins-policy:", 5000);
  return rows.filter((p) => !filter?.accountId || p.accountId === filter.accountId).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
}

export async function requestPolicy(input: { accountId: string; holderName: string; userId: string; role: "personal" | "organisation"; productId: string }): Promise<Policy> {
  const product = productsFor(await getProducts(), input.role).find((p) => p.id === input.productId);
  if (!product) throw AppError.notFound("Deze verzekering is niet beschikbaar");
  const open = (await listPolicies({ accountId: input.accountId })).find((p) => p.productId === product.id && (p.status === "requested" || p.status === "active"));
  if (open) throw AppError.conflict(open.status === "active" ? "Je hebt deze verzekering al" : "Je aanvraag loopt al");
  const policy: Policy = {
    id: randomUUID(),
    accountId: input.accountId,
    holderName: input.holderName,
    userId: input.userId,
    productId: product.id,
    productName: product.name,
    insurer: product.insurer,
    premiumCents: product.monthlyPremiumCents,
    status: "requested",
    requestedAt: new Date().toISOString(),
  };
  await kvSet(policyKey(policy.id), policy);
  return policy;
}

async function chargePremium(policy: Policy, period: string): Promise<void> {
  const platform = await platformAccount();
  await transfer({
    fromAccountId: policy.accountId,
    toAccountId: platform.id,
    amountCents: policy.premiumCents,
    kind: "INSURANCE_PREMIUM",
    description: `Premie ${policy.productName} ${period}`,
    toDescription: `Premie ${policy.productName} ${policy.holderName} ${period}`,
    fromCounterparty: policy.insurer,
    toCounterparty: policy.holderName,
    idempotencyKey: `ins:${policy.id}:${period}`,
  });
}

const period = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const plusMonth = (d: Date) => {
  const n = new Date(d);
  n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
};

/** Admin: the insurer accepted → active, first premium now. */
export async function activatePolicy(id: string, policyNumber: string): Promise<Policy> {
  const p = await kvGet<Policy>(policyKey(id));
  if (!p) throw AppError.notFound("Polis niet gevonden");
  if (p.status !== "requested") throw AppError.precondition("Alleen een aanvraag kan worden geactiveerd");
  const now = new Date();
  let arrears = false;
  try {
    await chargePremium(p, period(now));
  } catch {
    arrears = true;
  }
  const updated: Policy = { ...p, status: "active", policyNumber, activatedAt: now.toISOString(), nextPremiumAt: (arrears ? now : plusMonth(now)).toISOString(), arrears };
  await kvSet(policyKey(id), updated);
  return updated;
}

export async function rejectPolicy(id: string, note: string): Promise<Policy> {
  const p = await kvGet<Policy>(policyKey(id));
  if (!p) throw AppError.notFound("Polis niet gevonden");
  if (p.status !== "requested") throw AppError.precondition("Alleen een aanvraag kan worden afgewezen");
  const updated: Policy = { ...p, status: "rejected", note };
  await kvSet(policyKey(id), updated);
  return updated;
}

/** Holder (own policy) or admin: stop it; no further premiums. */
export async function cancelPolicy(id: string, accountId: string | null): Promise<Policy> {
  const p = await kvGet<Policy>(policyKey(id));
  if (!p || (accountId && p.accountId !== accountId)) throw AppError.notFound("Polis niet gevonden");
  if (p.status === "cancelled" || p.status === "rejected") return p;
  const updated: Policy = { ...p, status: "cancelled", cancelledAt: new Date().toISOString() };
  delete updated.nextPremiumAt;
  await kvSet(policyKey(id), updated);
  return updated;
}

/** Daily: collect premiums that are due. */
export async function chargeDuePremiums(now = new Date()): Promise<{ charged: number; arrears: number }> {
  const due = (await listPolicies()).filter((p) => p.status === "active" && p.nextPremiumAt && new Date(p.nextPremiumAt) <= now);
  let charged = 0;
  let arrears = 0;
  for (const p of due) {
    const at = new Date(p.nextPremiumAt!);
    try {
      await chargePremium(p, period(at));
      await kvSet(policyKey(p.id), { ...p, nextPremiumAt: plusMonth(at).toISOString(), arrears: false } satisfies Policy);
      charged++;
    } catch (err) {
      arrears++;
      if (!p.arrears) await kvSet(policyKey(p.id), { ...p, arrears: true } satisfies Policy);
      logger.info("insurance premium not collected yet", { policyId: p.id, reason: (err as Error).message });
    }
  }
  return { charged, arrears };
}

/** Premiums that will be collected within `days` (for the balance forecast). */
export async function upcomingPremiums(accountId: string, days: number): Promise<{ date: string; label: string; amountCents: number }[]> {
  const until = Date.now() + days * 86_400_000;
  const out: { date: string; label: string; amountCents: number }[] = [];
  for (const p of await listPolicies({ accountId })) {
    if (p.status !== "active" || !p.nextPremiumAt) continue;
    for (let d = new Date(p.nextPremiumAt); d.getTime() <= until; d = plusMonth(d)) {
      out.push({ date: d.toISOString(), label: `Premie ${p.productName}`, amountCents: -p.premiumCents });
    }
  }
  return out;
}
