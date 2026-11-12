import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { isBetalenUitFout } from "@/lib/billing/stripe-betalen-stand";
import { zetBetalenUit } from "@/lib/billing/stripe-betalen";
import { getStripeClient } from "@/lib/billing/stripe";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";
import { isValidIban } from "@/lib/billing/sepa";
import { nameSimilarity } from "@/lib/onboarding/verify";
import { banknaamPast } from "@/lib/kyc/naam-match";
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
  const rec = await kvGet<BankLoginResult>(key(userId)).catch(() => null);
  return rec ? herbeoordeelNaam(userId, rec) : null;
}

/**
 * De naam op het document van de laatste geslaagde ID-controle, of null. Een profielnaam kan
 * later veranderen, het document niet: dat is de vaste naam waar een bankrekening bij moet passen.
 */
export async function naamOpGeverifieerdDocument(userId: string): Promise<string | null> {
  try {
    const row = await prisma.identityVerification.findFirst({
      where: { userId, decisionStatus: "verified" },
      orderBy: { verifiedAt: "desc" },
      select: { rawPayload: true },
    });
    const payload = row?.rawPayload;
    const naam = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).nameOnDocument : null;
    return typeof naam === "string" && naam.trim() ? naam : null;
  } catch {
    return null; // geen document bekend (of niet leesbaar): dan geldt alleen de profielnaam
  }
}

/**
 * Een eerdere afwijzing die alléén op de naam viel (het IBAN klopte), opnieuw
 * bekijken met de huidige regel en de huidige profielnaam. Zo hoeft niemand
 * opnieuw bij de bank in te loggen (en een cent te betalen) als de regel
 * slimmer is geworden of als hij zijn profielnaam heeft aangevuld.
 */
async function herbeoordeelNaam(userId: string, rec: BankLoginResult): Promise<BankLoginResult> {
  if (rec.status !== "mismatch" || rec.problems.length !== 1 || rec.problems[0] !== "name") return rec;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    if (!user || !namesMatch(user.fullName, rec.verifiedName)) return rec;
    // Is de identiteit met een document bevestigd, dan moet de banknaam ook bij die naam passen:
    // een later aangepaste profielnaam mag een rekening van een ander niet alsnog goedkeuren.
    const docNaam = await naamOpGeverifieerdDocument(userId);
    if (docNaam && !namesMatch(docNaam, rec.verifiedName)) return rec;
    const nieuw: BankLoginResult = { ...rec, status: "verified", problems: [] };
    await kvSet(key(userId), nieuw);
    await Promise.all([
      prisma.freelancerProfile
        .update({ where: { userId }, data: { payoutIbanPendingVerification: false } })
        .catch(() => undefined),
      setFiscal(userId, { ibanPendingVerification: false }).catch(() => undefined),
    ]);
    await recordAudit({
      category: "KYC",
      action: "bank.login_verified",
      severity: "info",
      actorUserId: userId,
      actorLabel: "system",
      summary: `Bankrekening ••${rec.ibanLast4} alsnog geverifieerd: de naam bij de bank past bij het profiel`,
      targetType: "user",
      targetId: userId,
      metadata: { status: "verified", herbeoordeeld: true, bank: rec.bank },
    }).catch(() => undefined);
    return nieuw;
  } catch {
    return rec; // database even niet bereikbaar: de oude uitkomst blijft gelden
  }
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
  // achternaam + voorletter, in elke volgorde en schrijfwijze (lib/kyc/naam-match.ts)
  if (banknaamPast(accountName, bankName)) return true;
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
    // het live Stripe-account ontvangt geen betalingen (lib/billing/stripe-betalen.ts): dan een uur niet meer proberen,
    // het scherm toont meteen het bankafschrift, en één waarschuwing per uur in plaats van een fout per poging
    if (isBetalenUitFout(err)) {
      await zetBetalenUit((err as Error).message ?? "betalen uit").catch(() => undefined);
      throw AppError.upstream("Inloggen bij je bank kan tijdelijk niet. Upload een bankafschrift, dat werkt net zo goed.");
    }
    logger.error("bank login session failed", { error: (err as Error).message });
    throw AppError.upstream("Inloggen bij je bank lukt nu niet. Upload een bankafschrift of probeer het later opnieuw.");
  }
}

/** Called when the freelancer comes back from their bank: read and store the outcome. */
export async function syncBankLogin(userId: string, sessionId: string): Promise<BankLoginResult | null> {
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return null;
  // Already recorded (the return page often asks more than once, and the webhook asks too):
  // don't ask Stripe again, detach nothing twice and keep the audit trail to one entry.
  const known = await getBankLogin(userId);
  if (known?.sessionId === sessionId) return known;
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["setup_intent", "setup_intent.latest_attempt"],
  });
  if (session.metadata?.userId !== userId || session.metadata?.purpose !== "bank-login") return null;
  const si = session.setup_intent as Stripe.SetupIntent | null;
  const attempt = si?.latest_attempt as Stripe.SetupAttempt | null | undefined;
  const ideal = attempt?.payment_method_details?.ideal;
  if (si?.status !== "succeeded" || !ideal?.iban_last4 || !ideal.verified_name) return null;

  const [user, saved, pending, docNaam] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
    currentPayoutIban(userId),
    kvGet<string>(pendingKey(userId)).catch(() => null),
    naamOpGeverifieerdDocument(userId),
  ]);
  const iban = saved ?? pending;
  const problems: BankLoginResult["problems"] = [];
  // Past de bank bij het profiel én, als er een geverifieerd ID is, ook bij de naam op dat document:
  // een profielnaam kan zijn aangepast, het document niet (zelfde regel als bij de herbeoordeling).
  if (!user || !namesMatch(user.fullName, ideal.verified_name) || (docNaam && !namesMatch(docNaam, ideal.verified_name))) problems.push("name");
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
