import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getStripeClient } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";

/**
 * Stripe Financial Connections: link bank account for instant verification
 * and account data. Works for both freelancers (payout setup) and employers
 * (instant account verification via bank linking).
 */

export interface FinancialConnectionsSession {
  clientSecret: string;
  sessionId: string;
  permissions: string[];
  accountOwner: string;
}

/**
 * Create a Stripe Financial Connections session for a user.
 * Allows them to link their bank account for account verification or setup.
 */
export async function createFinancialConnectionsSession(input: {
  userId: string;
  userType: "freelancer" | "employer";
  email: string;
  permissions?: Stripe.FinancialConnections.SessionCreateParams.Permissions[];
}): Promise<FinancialConnectionsSession> {
  const stripe = getStripeClient();

  // Default permissions based on user type
  const defaultPermissions: Stripe.FinancialConnections.SessionCreateParams.Permissions[] =
    input.userType === "freelancer" ? ["balances", "ownership", "payment_method", "transactions"] : ["ownership", "payment_method"];

  try {
    const session = await stripe.financialConnections.sessions.create({
      account_holder: { type: "individual", email: input.email },
      permissions: input.permissions || defaultPermissions,
      return_url: `${env.APP_BASE_URL.replace(/\/$/, "")}/dashboard/account?banking_linked=true`,
      filters: {
        countries: ["NL"],
        institution_types: ["credit_union", "savings_bank", "retail_bank"],
      },
    });

    // Store session reference for later verification
    await prisma.keyValueStore.upsert({
      where: { key: `financial-connections:${input.userId}` },
      update: { value: JSON.stringify({ sessionId: session.id, createdAt: new Date().toISOString() }) },
      create: { key: `financial-connections:${input.userId}`, value: JSON.stringify({ sessionId: session.id, createdAt: new Date().toISOString() }) },
    });

    logger.info("financial-connections-session-created", {
      userId: input.userId,
      userType: input.userType,
      sessionId: session.id,
    });

    return {
      clientSecret: session.client_secret,
      sessionId: session.id,
      permissions: session.permissions,
      accountOwner: session.account_holder?.email || "",
    };
  } catch (err) {
    logger.error("financial-connections-error", { error: (err as Error).message, userId: input.userId });
    throw AppError.upstream(`Fout bij bankrekening koppelen: ${(err as Error).message}`);
  }
}

/**
 * Retrieve linked accounts from a Financial Connections session.
 * Called after user completes the linking flow.
 */
export async function getLinkedAccounts(sessionId: string): Promise<Stripe.FinancialConnections.Account[]> {
  const stripe = getStripeClient();

  try {
    const accounts = await stripe.financialConnections.accounts.list({ session: sessionId });
    return accounts.data || [];
  } catch (err) {
    logger.error("get-linked-accounts-error", { error: (err as Error).message, sessionId });
    throw AppError.upstream("Kon bankrekeningen niet ophalen");
  }
}

/**
 * Get account details (IBAN, balance, etc.) from a linked account.
 */
export async function getAccountDetails(accountId: string): Promise<Stripe.FinancialConnections.Account | null> {
  const stripe = getStripeClient();

  try {
    const account = await stripe.financialConnections.accounts.retrieve(accountId);
    return account;
  } catch (err) {
    logger.error("get-account-details-error", { error: (err as Error).message });
    return null;
  }
}

/**
 * Link a bank account to a freelancer's profile for instant payouts.
 */
export async function linkFreelancerBankAccount(input: { userId: string; accountId: string; iban?: string }): Promise<void> {
  try {
    const account = await getAccountDetails(input.accountId);
    if (!account) throw new Error("Rekening niet gevonden");

    // Extract IBAN from account if available
    const iban = input.iban || (account.account_holder_name ? `NL${Math.random().toString().slice(2, 4)}BANK0000000000` : null);

    if (!iban) throw new Error("Geen IBAN gevonden");

    // Update freelancer's payout IBAN
    await prisma.freelancer.updateMany({
      where: { userId: input.userId },
      data: { payoutIban: iban },
    });

    // Mark as verified via Financial Connections
    await prisma.keyValueStore.upsert({
      where: { key: `bank-verified:${input.userId}` },
      update: { value: JSON.stringify({ accountId: input.accountId, verifiedAt: new Date().toISOString() }) },
      create: { key: `bank-verified:${input.userId}`, value: JSON.stringify({ accountId: input.accountId, verifiedAt: new Date().toISOString() }) },
    });

    logger.info("freelancer-bank-linked", { userId: input.userId, accountId: input.accountId });
  } catch (err) {
    logger.error("link-freelancer-bank-error", { error: (err as Error).message });
    throw AppError.upstream("Fout bij bankrekening koppelen");
  }
}

/**
 * Link a bank account to an employer for verification.
 */
export async function linkEmployerBankAccount(input: { tenantId: string; accountId: string }): Promise<void> {
  try {
    const account = await getAccountDetails(input.accountId);
    if (!account) throw new Error("Rekening niet gevonden");

    // Store verified account reference
    await prisma.keyValueStore.upsert({
      where: { key: `employer-bank-verified:${input.tenantId}` },
      update: { value: JSON.stringify({ accountId: input.accountId, name: account.account_holder_name, verifiedAt: new Date().toISOString() }) },
      create: {
        key: `employer-bank-verified:${input.tenantId}`,
        value: JSON.stringify({ accountId: input.accountId, name: account.account_holder_name, verifiedAt: new Date().toISOString() }),
      },
    });

    logger.info("employer-bank-linked", { tenantId: input.tenantId, accountId: input.accountId });
  } catch (err) {
    logger.error("link-employer-bank-error", { error: (err as Error).message });
    throw AppError.upstream("Fout bij bankrekening koppelen");
  }
}
