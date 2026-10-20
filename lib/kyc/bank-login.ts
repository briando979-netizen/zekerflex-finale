import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { getStripeClient } from "@/lib/billing/stripe";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";
import { isValidIban } from "@/lib/billing/sepa";
import { nameSimilarity } from "@/lib/onboarding/verify";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Bank-account check by logging in at your own bank (iDEAL via Stripe), in
// place of uploading a bank statement. A Stripe Checkout session in "setup"
// mode sends the freelancer to their bank's iDEAL screen; nothing is charged.
// The bank returns the verified account-holder name and the last 4 digits of
// the IBAN, which we compare with the account's name and payout IBAN. A match
// counts as the bank document (docStatus().bankOk) and lifts a payout hold
// from an IBAN change. The generated SEPA payment method is detached straight
// away — we keep only the check's outcome.
// iDEAL only covers Dutch banks, so the statement upload stays as fallback.
// ---------------------------------------------------------------------------

export interface BankLoginResult {
  status: "verified" | "mismatch";
  verifiedName: string;
  ibanLast4: string;
  bank: string | null;
  /** what didn't match, for the freelancer and the admin */
  problems: ("name" | "iban")[];
  at: string;
  sessionId: string;
}

const key = (userId: string) => `bank-login:${userId}`;
const customerKey = (userId: string) => `bank-login-customer:${userId}`;
/** the IBAN a not-yet-submitted form had when the bank login started */
const pendingKey = (userId: string) => `bank-login-iban:${userId}`;

export function bankLoginEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && process.env.BANK_LOGIN_ENABLED !== "false";
}

export async function getBankLogin(userId: string): Promise<BankLoginResult | null> {
  return kvGet<BankLoginResult>(key(userId)).catch(() => null);
}

export async function clearBankLogin(userId: string): Promise<void> {
  try {
    await kvDelete(key(userId));
  } catch {
    /* nothing stored, or KV unreachable — the IBAN check fails closed anyway */
  }
}

/** The payout IBAN on file: freelancer profile first, payroll profile as fallback. */
export async function currentPayoutIban(userId: string): Promise<string | null> {
  const [fp, fiscal] = await Promise.all([
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { payoutIban: true } }),
    getFiscal(userId).catch(() => null),
  ]);
  const iban = fp?.payoutIban || fiscal?.iban || null;
  return iban ? iban.replace(/\s+/g, "").toUpperCase() : null;
}

/** A verified bank login still proves the CURRENT IBAN (same last 4 digits). */
export async function bankLoginProvesIban(userId: string): Promise<boolean> {
  const [rec, saved] = await Promise.all([getBankLogin(userId), currentPayoutIban(userId)]);
  // Before the verification form is submitted there's no saved IBAN yet —
  // the one typed when the bank login started counts until then.
  const iban = saved ?? (await kvGet<string>(pendingKey(userId)).catch(() => null));
  return Boolean(rec && rec.status === "verified" && iban && iban.endsWith(rec.ibanLast4));
}

export function namesMatch(accountName: string, bankName: string): boolean {
  if (nameSimilarity(accountName, bankName) >= 0.5) return true;
  // Banks often send "J. DE VRIES" — accept a matching surname.
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 2);
  const surname = norm(accountName).at(-1);
  return Boolean(surname && surname.length >= 3 && norm(bankName).includes(surname));
}

async function customerFor(userId: string, email: string, name: string): Promise<string> {
  const known = await kvGet<string>(customerKey(userId)).catch(() => null);
  if (known) return known;
  const c = await getStripeClient().customers.create({ email, name, metadata: { userId, purpose: "bank-login" } });
  await kvSet(customerKey(userId), c.id);
  return c.id;
}

/**
 * Start the iDEAL bank login; returns the Stripe-hosted URL. `ibanHint` is
 * what the freelancer typed in the (not yet submitted) verification form —
 * used to compare against only when no IBAN is saved yet.
 */
export async function startBankLogin(userId: string, ibanHint?: string): Promise<string> {
  if (!bankLoginEnabled()) throw AppError.validation("Inloggen bij je bank staat nog niet aan.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } });
  if (!user) throw AppError.notFound("Account niet gevonden");
  const typed = ibanHint?.replace(/\s+/g, "").toUpperCase() ?? "";
  const candidate = (await currentPayoutIban(userId)) ?? (typed && isValidIban(typed) ? typed : null);
  if (!candidate) {
    throw AppError.validation(
      typed ? "Dit IBAN klopt niet — controleer het nummer." : "Vul eerst je IBAN in, dan controleren we die via je bank.",
    );
  }
  await kvSet(pendingKey(userId), candidate);
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  try {
    const session = await getStripeClient().checkout.sessions.create({
      mode: "setup",
      currency: "eur",
      payment_method_types: ["ideal"],
      customer: await customerFor(userId, user.email, user.fullName),
      metadata: { userId, purpose: "bank-login" },
      success_url: `${base}/dashboard/verificatie?bank_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/dashboard/verificatie?bank_session=geannuleerd`,
    });
    if (!session.url) throw new Error("no checkout url");
    return session.url;
  } catch (err) {
    logger.error("bank login session failed", { error: (err as Error).message });
    throw AppError.upstream("Inloggen bij je bank lukt nu niet. Upload een bankafschrift of probeer het later opnieuw.");
  }
}

/** Called when the freelancer comes back from their bank: read and store the outcome. */
export async function syncBankLogin(userId: string, sessionId: string): Promise<BankLoginResult | null> {
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return null;
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["setup_intent", "setup_intent.latest_attempt"],
  });
  if (session.metadata?.userId !== userId || session.metadata?.purpose !== "bank-login") return null;
  const si = session.setup_intent as Stripe.SetupIntent | null;
  const attempt = si?.latest_attempt as Stripe.SetupAttempt | null | undefined;
  const ideal = attempt?.payment_method_details?.ideal;
  if (si?.status !== "succeeded" || !ideal?.iban_last4 || !ideal.verified_name) return null;

  const [user, saved, pending] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
    currentPayoutIban(userId),
    kvGet<string>(pendingKey(userId)).catch(() => null),
  ]);
  const iban = saved ?? pending;
  const problems: BankLoginResult["problems"] = [];
  if (!user || !namesMatch(user.fullName, ideal.verified_name)) problems.push("name");
  if (!iban || !iban.endsWith(ideal.iban_last4)) problems.push("iban");

  const rec: BankLoginResult = {
    status: problems.length === 0 ? "verified" : "mismatch",
    verifiedName: ideal.verified_name,
    ibanLast4: ideal.iban_last4,
    bank: ideal.bank ?? null,
    problems,
    at: new Date().toISOString(),
    sessionId,
  };
  await kvSet(key(userId), rec);

  // We only wanted the check — don't keep a SEPA mandate around.
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  const generated = typeof ideal.generated_sepa_debit === "string" ? ideal.generated_sepa_debit : ideal.generated_sepa_debit?.id;
  for (const id of [pm, generated]) if (id) await stripe.paymentMethods.detach(id).catch(() => undefined);

  if (rec.status === "verified") {
    await Promise.all([
      prisma.freelancerProfile
        .update({ where: { userId }, data: { payoutIbanPendingVerification: false } })
        .catch(() => undefined),
      setFiscal(userId, { ibanPendingVerification: false }).catch(() => undefined),
    ]);
  }
  await recordAudit({
    category: "KYC",
    action: rec.status === "verified" ? "bank.login_verified" : "bank.login_mismatch",
    severity: rec.status === "verified" ? "info" : "warning",
    actorUserId: userId,
    actorLabel: "user",
    summary:
      rec.status === "verified"
        ? `Bankrekening ••${rec.ibanLast4} geverifieerd via inloggen bij de bank`
        : `Bank-login komt niet overeen (${problems.join(" + ")}): bank zegt "${rec.verifiedName}" ••${rec.ibanLast4}`,
    targetType: "user",
    targetId: userId,
    metadata: { status: rec.status, problems, bank: rec.bank },
  }).catch(() => undefined);
  return rec;
}
