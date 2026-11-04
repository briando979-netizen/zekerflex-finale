import { notifyPendingReactions, setKvkBewijs } from "@/lib/company/verified";
import { eigendomVanEmail } from "@/lib/company/eigendom";
import { alertOwnerLater } from "@/lib/ops/alert";
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
  /** KVK klopt, maar niet aantoonbaar dat de aanmelder erbij hoort: ZekerFlex controleert met de hand */
  inControle: boolean;
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
  let inControle = false;
  let companyName: string | null = null;
  try {
    const reg = await registerTenantCompany({ tenantId, kvkNumber: cleanKvk, allowInactive: true });
    kvkValid = reg.kvkValid;
    companyName = reg.profile.legalName;
    if (!kvkValid) reasons.push(...reg.validation.reasons);
    // Een geldig KVK-nummer bewijst alleen dat het bedrijf bestaat. Hoort de
    // aanmelder er aantoonbaar bij (eigen maildomein dat bij de naam past)?
    if (kvkValid) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      const bewijs = eigendomVanEmail(user?.email ?? "", [reg.profile.legalName, reg.profile.tradeName]);
      if (bewijs.ok) {
        await setKvkBewijs(tenantId, { via: "domein", domein: bewijs.domein, at: new Date().toISOString() });
      } else {
        inControle = true;
        alertOwnerLater({
          key: `bedrijf-controle:${tenantId}`,
          title: `Bedrijf wacht op controle: ${reg.profile.legalName}`,
          detail: `KVK ${reg.profile.kvkNumber} is geldig, maar de aanmelder (${bewijs.reden === "gratis-mail" ? "gratis maildienst" : "maildomein past niet bij de naam"}) is niet automatisch aan dit bedrijf te koppelen. Bel of mail het bedrijf en keur het goed in Admin → Bedrijven.`,
          severity: "warning",
          url: `/admin/bedrijven/${tenantId}`,
        });
      }
    }
  } catch (err) {
    // De KVK-koppeling geeft technische, Engelse fouten ("No Handelsregister entry…"): hier in gewoon Nederlands.
    reasons.push(
      err instanceof AppError && err.status === 404
        ? "Dit KVK-nummer staat niet in het Handelsregister."
        : err instanceof AppError && err.status === 422 && /cijfers/.test(err.message)
          ? err.message
          : err instanceof AppError && err.status >= 500
            ? "Het Handelsregister is nu niet bereikbaar. Probeer het over een paar minuten opnieuw."
            : (err as { code?: string }).code === "P2002"
              ? "Dit KVK-nummer hoort al bij een ander ZekerFlex-account. Is dit jouw bedrijf? Neem contact met ons op, dan zoeken we het uit."
              : "Het KVK-nummer kon niet worden gecontroleerd.",
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
    summary: `Werkgever-onboarding: ${companyName ?? "organisatie"} (KVK ${kvkValid ? (inControle ? "geldig, controle met de hand" : "geldig en gekoppeld") : "open"})`,
    targetType: "tenant",
    targetId: tenantId,
    metadata: { kvkValid, inControle, branchId: branch.id },
  });

  if (kvkValid && !inControle) void notifyPendingReactions(tenantId);

  return { kvkValid, inControle, companyName, branchId: branch.id, reasons: [...new Set(reasons)] };
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
