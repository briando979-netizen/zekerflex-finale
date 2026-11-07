import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";

/**
 * Stripe user data: verification, identity checks, KVK, BTW
 * Sync to admin dashboard & auto-fill user profiles
 */

export interface StripeUserData {
  stripeCustomerId?: string;
  verificationStatus?: string;
  identityVerified?: boolean;
  kvkStatus?: string;
  btwStatus?: string;
  legalEntity?: {
    legalEntityType?: string;
    companyName?: string;
    registrationNumber?: string;
    taxId?: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    address?: string;
  };
  documents?: Array<{
    type: string;
    status: string;
    createdAt: string;
  }>;
}

/**
 * Haal Stripe account gegevens op voor een user
 */
export async function getStripeUserData(
  stripeAccountId: string,
): Promise<StripeUserData> {
  if (!stripeAccountId) return {};

  const stripe = getStripeClient();

  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);

    const data: StripeUserData = {
      stripeCustomerId: account.id,
      verificationStatus: account.verification?.status,
      identityVerified: account.verification?.status === "verified",
    };

    // Legal entity data (KVK, BTW equivalent)
    if (account.legal_entity) {
      data.legalEntity = {
        legalEntityType: account.legal_entity.type,
        companyName: account.legal_entity.business_name,
        registrationNumber: account.legal_entity.business_tax_id,
        taxId: account.legal_entity.personal_tax_id,
        firstName: account.legal_entity.first_name,
        lastName: account.legal_entity.last_name,
        dateOfBirth: account.legal_entity.dob
          ? `${account.legal_entity.dob.year}-${String(account.legal_entity.dob.month).padStart(2, "0")}-${String(account.legal_entity.dob.day).padStart(2, "0")}`
          : undefined,
      };
    }

    // Documents (ID verification, etc)
    if (account.verification?.document) {
      data.documents = [
        {
          type: "identity",
          status: account.verification.document.status,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    logger.info("stripe-user-data-fetched", { stripeAccountId });
    return data;
  } catch (err) {
    logger.error("stripe-user-data-error", { error: (err as Error).message });
    return {};
  }
}

/**
 * Auto-fill user profile from Stripe data
 */
export async function autoFillUserFromStripe(
  userId: string,
  stripeData: StripeUserData,
): Promise<void> {
  const updates: Record<string, any> = {};

  if (stripeData.legalEntity) {
    const le = stripeData.legalEntity;
    if (le.registrationNumber) updates.kvkNumber = le.registrationNumber;
    if (le.taxId) updates.vatNumber = le.taxId;
    if (le.companyName) updates.companyName = le.companyName;
  }

  if (Object.keys(updates).length === 0) return;

  // Update freelancer profile if exists
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (freelancer) {
    await prisma.freelancerProfile.update({
      where: { id: freelancer.id },
      data: updates,
    });

    logger.info("user-profile-autofilled", { userId, fields: Object.keys(updates) });
  }
}

/**
 * Sync all Stripe verified users to admin
 */
export async function syncStripeUsersToAdmin(): Promise<{
  synced: number;
  verified: number;
}> {
  const stripe = getStripeClient();
  let synced = 0;
  let verified = 0;

  // Fetch connected accounts (max 100)
  const accounts = await stripe.accounts.list({ limit: 100 });

  for (const account of accounts.data) {
    if (!account.id) continue;

    const stripeData = await getStripeUserData(account.id);

    // Store in KV for admin dashboard
    await prisma.keyValueStore.upsert({
      where: { key: `stripe-user:${account.id}` },
      update: {
        value: JSON.stringify(stripeData),
        updatedAt: new Date(),
      },
      create: {
        key: `stripe-user:${account.id}`,
        value: JSON.stringify(stripeData),
      },
    });

    if (stripeData.identityVerified) verified++;
    synced++;
  }

  logger.info("stripe-users-synced", { synced, verified });
  return { synced, verified };
}
