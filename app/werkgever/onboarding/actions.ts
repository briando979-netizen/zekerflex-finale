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
  /** een bedrijf buiten Nederland: geen KVK, een beheerder keurt het goed */
  buitenlands?: boolean;
  reasons?: string[];
  /** wat er ingevuld was: na een fout blijft het staan (het formulier wordt na een server-actie teruggezet) */
  values?: { land: string; kvkNumber: string; btwNummer: string; registratieNummer: string; branchName: string; addressLine: string; postalCode: string; houseNumber: string };
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

  const values = {
    land: String(formData.get("land") ?? "NL").slice(0, 2),
    kvkNumber: String(formData.get("kvkNumber") ?? "").slice(0, 20),
    btwNummer: String(formData.get("btwNummer") ?? "").slice(0, 24),
    registratieNummer: String(formData.get("registratieNummer") ?? "").slice(0, 40),
    branchName: String(formData.get("branchName") ?? "").slice(0, 120),
    addressLine: String(formData.get("addressLine") ?? "").slice(0, 160),
    postalCode: String(formData.get("postalCode") ?? "").slice(0, 12),
    houseNumber: String(formData.get("houseNumber") ?? "").slice(0, 12),
  };
  const parsed = employerOnboardingSchema.safeParse({
    ...values,
    branchName: formData.get("branchName"),
    addressLine: formData.get("addressLine"),
    postalCode: formData.get("postalCode"),
    houseNumber: formData.get("houseNumber"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer de gegevens.", done: false, values };
  }

  try {
    const res = await submitEmployerOnboarding(principal.userId, tenantId, parsed.data);
    revalidatePath("/werkgever");
    // Een KVK-nummer dat niet klopt is geen afgeronde stap: het formulier blijft open
    // met de reden (4 nov 2026: de stap kreeg een groen vinkje bij een verzonnen nummer).
    if (!res.kvkValid) {
      const reden = res.reasons[0] ?? (res.buitenlands ? "We konden je bedrijfsgegevens niet bevestigen." : "We konden dit KVK-nummer niet bevestigen in het Handelsregister.");
      return {
        error: res.buitenlands
          ? `${reden} Controleer je gegevens en probeer het opnieuw; je vestiging is al opgeslagen.`
          : `${reden} Controleer het nummer (8 cijfers, bijvoorbeeld op je KVK-uittreksel) en probeer het opnieuw; je vestiging is al opgeslagen.`,
        done: false,
        reasons: res.reasons,
        values,
      };
    }
    return {
      error: null,
      done: true,
      companyName: res.companyName,
      kvkValid: res.kvkValid,
      inControle: res.inControle,
      buitenlands: res.buitenlands,
      reasons: res.reasons,
    };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, done: false, values };
    return { error: "De onboarding kon niet worden afgerond. Probeer het opnieuw.", done: false, values };
  }
}
