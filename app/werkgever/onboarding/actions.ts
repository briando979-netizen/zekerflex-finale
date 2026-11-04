"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { submitEmployerOnboarding, employerOnboardingSchema } from "@/lib/onboarding/employer";
import { getOrgProfileExtra, saveOrgProfileExtra } from "@/lib/profile/store";
import { AppError } from "@/lib/errors";

const profileSchema = z.object({
  role: z.string().trim().max(60).optional(),
  sector: z.string().trim().max(60).optional(),
  shortageFrequency: z.string().trim().max(60).optional(),
  urgency: z.string().trim().max(60).optional(),
  priorPlatform: z.string().trim().max(60).optional(),
  profileStepDone: z.enum(["1", ""]).optional(),
  coverStepDone: z.enum(["1", ""]).optional(),
});

/** Persist the wizard's profiling answers / a "profile step done" flag. */
export async function saveOnboardingProfileAction(formData: FormData): Promise<{ ok: boolean }> {
  const principal = await requirePrincipal();
  requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) return { ok: false };

  const p = profileSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { ok: false };

  const cur = await getOrgProfileExtra(tenantId);
  await saveOrgProfileExtra(tenantId, {
    onboarding: {
      ...cur.onboarding,
      ...(p.data.role ? { role: p.data.role } : {}),
      ...(p.data.sector ? { sector: p.data.sector } : {}),
      ...(p.data.shortageFrequency ? { shortageFrequency: p.data.shortageFrequency } : {}),
      ...(p.data.urgency ? { urgency: p.data.urgency } : {}),
      ...(p.data.priorPlatform ? { priorPlatform: p.data.priorPlatform } : {}),
      ...(p.data.profileStepDone === "1" ? { profileStepDone: true } : {}),
      ...(p.data.coverStepDone === "1" ? { coverStepDone: true } : {}),
    },
  });
  revalidatePath("/werkgever");
  return { ok: true };
}

export interface EmployerOnboardingState {
  error: string | null;
  done: boolean;
  companyName?: string | null;
  kvkValid?: boolean;
  /** KVK klopt, maar ZekerFlex controleert met de hand of de aanmelder bij het bedrijf hoort */
  inControle?: boolean;
  reasons?: string[];
}

export async function employerOnboardingAction(
  _prev: EmployerOnboardingState,
  formData: FormData,
): Promise<EmployerOnboardingState> {
  const principal = await requirePrincipal();
  requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) return { error: "Geen organisatie gevonden voor je account.", done: false };

  const parsed = employerOnboardingSchema.safeParse({
    kvkNumber: formData.get("kvkNumber"),
    branchName: formData.get("branchName"),
    addressLine: formData.get("addressLine"),
    postalCode: formData.get("postalCode"),
    houseNumber: formData.get("houseNumber"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer de gegevens.", done: false };
  }

  try {
    const res = await submitEmployerOnboarding(principal.userId, tenantId, parsed.data);
    revalidatePath("/werkgever");
    // Een KVK-nummer dat niet klopt is geen afgeronde stap: het formulier blijft open
    // met de reden (4 nov 2026: de stap kreeg een groen vinkje bij een verzonnen nummer).
    if (!res.kvkValid) {
      const reden = res.reasons[0] ?? "We konden dit KVK-nummer niet bevestigen in het Handelsregister.";
      return {
        error: `${reden} Controleer het nummer (8 cijfers, bijvoorbeeld op je KVK-uittreksel) en probeer het opnieuw; je vestiging is al opgeslagen.`,
        done: false,
        reasons: res.reasons,
      };
    }
    return {
      error: null,
      done: true,
      companyName: res.companyName,
      kvkValid: res.kvkValid,
      inControle: res.inControle,
      reasons: res.reasons,
    };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, done: false };
    return { error: "De onboarding kon niet worden afgerond. Probeer het opnieuw.", done: false };
  }
}
