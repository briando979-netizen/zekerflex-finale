import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { geocodePostcode } from "@/lib/integrations/pdok";
import { registerTenantCompany } from "@/lib/company/registration";

export const employerOnboardingSchema = z.object({
  kvkNumber: z.string().trim().min(6).max(20),
  branchName: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().min(3).max(160),
  postalCode: z.string().trim().regex(/^\s*\d{4}\s*[A-Za-z]{2}\s*$/, "Gebruik een geldige postcode"),
  houseNumber: z.string().trim().min(1).max(12),
});
export type EmployerOnboardingInput = z.infer<typeof employerOnboardingSchema>;

const DEFAULT_MATCHING_CONFIG = {
  minScore: 0.55,
  maxTravelMinutes: 60,
  weights: { reliability: 0.4, travel: 0.35, skill: 0.25 },
  travelModes: ["TRANSIT", "BICYCLING", "DRIVING"],
  offerTtlMinutes: 15,
  notificationWaveSize: 5,
  autoAcceptance: {
    enabled: false,
    minScore: 0.82,
    minAcceptanceScore: 0.8,
    minReliabilityScore: 0.9,
    requireWithinGeofence: false,
    maxSeatsToAutoFill: 1,
  },
} satisfies Prisma.InputJsonValue;

export interface EmployerOnboardingResult {
  kvkValid: boolean;
  companyName: string | null;
  branchId: string;
  reasons: string[];
}

export async function submitEmployerOnboarding(
  userId: string,
  tenantId: string,
  input: EmployerOnboardingInput,
): Promise<EmployerOnboardingResult> {
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId, role: { in: ["HQ_ADMIN", "PLATFORM_ADMIN"] } },
    select: { id: true },
  });
  if (!membership) throw AppError.forbidden("Je beheert deze organisatie niet.");

  const cleanKvk = input.kvkNumber.replace(/[^\d]/g, "");
  const geo = await geocodePostcode(input.postalCode, input.houseNumber);
  const reasons: string[] = [];

  let kvkValid = false;
  let companyName: string | null = null;
  try {
    const reg = await registerTenantCompany({ tenantId, kvkNumber: cleanKvk, allowInactive: true });
    kvkValid = reg.kvkValid;
    companyName = reg.profile.legalName;
    if (!kvkValid) reasons.push(...reg.validation.reasons);
  } catch (err) {
    reasons.push(
      err instanceof AppError ? err.message : "Het KVK-nummer kon niet worden gecontroleerd.",
    );
  }

  // First branch for the organization.
  const existing = await prisma.branch.findFirst({
    where: { tenantId },
    select: { id: true },
  });

  const branch = existing
    ? await prisma.branch.update({
        where: { id: existing.id },
        data: {
          name: input.branchName,
          addressLine: input.addressLine,
          postalCode: geo.postalCode,
          city: geo.city ?? "Onbekend",
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
        select: { id: true },
      })
    : await prisma.branch.create({
        data: {
          tenantId,
          name: input.branchName,
          addressLine: input.addressLine,
          postalCode: geo.postalCode,
          city: geo.city ?? "Onbekend",
          latitude: geo.latitude,
          longitude: geo.longitude,
          geofenceRadiusMeters: 150,
          matchingConfig: DEFAULT_MATCHING_CONFIG,
        },
        select: { id: true },
      });

  if (companyName) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: companyName },
    }).catch(() => undefined);
  }

  await recordAudit({
    category: "COMPANY",
    action: "employer.onboarding",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Werkgever-onboarding: ${companyName ?? "organisatie"} (KVK ${kvkValid ? "geldig" : "open"})`,
    targetType: "tenant",
    targetId: tenantId,
    metadata: { kvkValid, branchId: branch.id },
  });

  return { kvkValid, companyName, branchId: branch.id, reasons: [...new Set(reasons)] };
}

/** Has this organization completed onboarding (KVK linked + at least one branch)? */
export async function isEmployerOnboarded(tenantIds: string[]): Promise<boolean> {
  if (tenantIds.length === 0) return false;
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: tenantIds }, companyRegistrationId: { not: null } },
    select: { id: true, branches: { take: 1, select: { id: true } } },
  });
  return Boolean(tenant && tenant.branches.length > 0);
}
