import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Tenant Onboarding - Self-serve signup, trial management, billing account creation, API key provisioning
 */

const onboardingStepSchema = z.object({
  step: z.enum([
    "account_created",
    "profile_completed",
    "company_verified",
    "payment_added",
    "api_key_generated",
    "first_api_call",
    "sso_configured",
    "custom_domain_set",
    "onboarding_completed",
  ]),
});

export type OnboardingStep = z.infer<typeof onboardingStepSchema>["step"];

/**
 * Initialize onboarding for a new tenant
 */
export async function initializeTenantOnboarding(
  tenantId: string,
  data?: {
    companyName?: string;
    companyWebsite?: string;
    contactEmail?: string;
    contactPhone?: string;
  }
) {
  const trialStartsAt = new Date();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

  return await prisma.tenantOnboarding.upsert({
    where: { tenantId },
    update: data,
    create: {
      tenantId,
      trialStartsAt,
      trialEndsAt,
      trialDaysRemaining: 14,
      completedSteps: [],
      currentStep: "account_created",
      progress: 10,
      ...data,
    },
  });
}

/**
 * Mark an onboarding step as complete
 */
export async function completeOnboardingStep(
  tenantId: string,
  step: OnboardingStep
) {
  const onboarding = await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });

  if (!onboarding) {
    throw AppError.notFound("Onboarding niet geinitialiseerd");
  }

  const completedSteps = [...(onboarding.completedSteps ?? [])];
  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  const progress = Math.min(100, Math.round((completedSteps.length / 9) * 100));

  // Determine next step
  const stepOrder: OnboardingStep[] = [
    "account_created",
    "profile_completed",
    "company_verified",
    "payment_added",
    "api_key_generated",
    "first_api_call",
    "sso_configured",
    "custom_domain_set",
    "onboarding_completed",
  ];

  const currentIndex = stepOrder.indexOf(step);
  const nextStep = currentIndex < stepOrder.length - 1 ? stepOrder[currentIndex + 1] : null;

  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data: {
      completedSteps,
      currentStep: nextStep,
      progress,
    },
  });
}

/**
 * Get onboarding progress for a tenant
 */
export async function getOnboardingProgress(
  tenantId: string
): Promise<{
  completedSteps: string[];
  currentStep: string | null;
  progress: number;
  trialDaysRemaining: number | null;
}> {
  const onboarding = await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });

  if (!onboarding) {
    return {
      completedSteps: [],
      currentStep: null,
      progress: 0,
      trialDaysRemaining: 0,
    };
  }

  // Calculate remaining trial days
  let trialDaysRemaining = null;
  if (onboarding.trialEndsAt) {
    const now = new Date();
    const daysRemaining = Math.ceil(
      (onboarding.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    trialDaysRemaining = Math.max(0, daysRemaining);
  }

  return {
    completedSteps: onboarding.completedSteps ?? [],
    currentStep: onboarding.currentStep,
    progress: onboarding.progress ?? 0,
    trialDaysRemaining,
  };
}

/**
 * Check if a tenant is in trial period
 */
export async function isInTrial(tenantId: string): Promise<boolean> {
  const onboarding = await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });

  if (!onboarding?.trialEndsAt) {
    return false;
  }

  return new Date() < onboarding.trialEndsAt;
}

/**
 * Get days remaining in trial
 */
export async function getTrialDaysRemaining(tenantId: string): Promise<number> {
  const onboarding = await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });

  if (!onboarding?.trialEndsAt) {
    return 0;
  }

  const now = new Date();
  const daysRemaining = Math.ceil(
    (onboarding.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return Math.max(0, daysRemaining);
}

/**
 * Mark API key as generated during onboarding
 */
export async function markApiKeyGenerated(tenantId: string) {
  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data: { apiKeyGenerated: true },
  });
}

/**
 * Record first API call timestamp
 */
export async function recordFirstApiCall(tenantId: string) {
  const onboarding = await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });

  if (!onboarding?.firstApiCallAt) {
    await completeOnboardingStep(tenantId, "first_api_call");

    return await prisma.tenantOnboarding.update({
      where: { tenantId },
      data: { firstApiCallAt: new Date() },
    });
  }

  return onboarding;
}

/**
 * Mark SSO as configured
 */
export async function markSsoConfigured(tenantId: string) {
  await completeOnboardingStep(tenantId, "sso_configured");

  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data: { ssoConfigured: true },
  });
}

/**
 * Mark payment method as added
 */
export async function markPaymentMethodAdded(tenantId: string) {
  await completeOnboardingStep(tenantId, "payment_added");

  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data: { paymentMethodAdded: true },
  });
}

/**
 * Update billing address during onboarding
 */
export async function updateBillingAddress(tenantId: string, address: string) {
  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data: { billingAddress: address },
  });
}

/**
 * Update company information during onboarding
 */
export async function updateCompanyInfo(
  tenantId: string,
  data: {
    companyName?: string;
    companyWebsite?: string;
    contactEmail?: string;
    contactPhone?: string;
  }
) {
  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data,
  });
}

/**
 * Check if onboarding is complete
 */
export async function isOnboardingComplete(tenantId: string): Promise<boolean> {
  const onboarding = await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });

  return (onboarding?.completedSteps ?? []).includes("onboarding_completed");
}

/**
 * Get onboarding details for a tenant
 */
export async function getTenantOnboarding(tenantId: string) {
  return await prisma.tenantOnboarding.findUnique({
    where: { tenantId },
  });
}

/**
 * Skip to a specific onboarding step
 */
export async function skipToStep(tenantId: string, targetStep: OnboardingStep) {
  const stepOrder: OnboardingStep[] = [
    "account_created",
    "profile_completed",
    "company_verified",
    "payment_added",
    "api_key_generated",
    "first_api_call",
    "sso_configured",
    "custom_domain_set",
    "onboarding_completed",
  ];

  const targetIndex = stepOrder.indexOf(targetStep);
  if (targetIndex === -1) {
    throw AppError.validation("Ongeldig onboarding stap");
  }

  // Complete all steps up to the target
  const completedSteps = stepOrder.slice(0, targetIndex + 1);
  const progress = Math.round(((targetIndex + 1) / stepOrder.length) * 100);

  return await prisma.tenantOnboarding.update({
    where: { tenantId },
    data: {
      completedSteps,
      currentStep: targetStep,
      progress,
    },
  });
}
