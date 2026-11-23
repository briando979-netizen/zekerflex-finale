"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra, saveOrgProfileExtra } from "@/lib/profile/store";
import { maakBrancheKeuze } from "@/lib/shifts/branche-keuze";

// Jouw start (23 nov 2026): de KVK-stap is weg. Het bedrijf en zijn nummers komen pas als het iemand wil inplannen, in
// controle-actions.ts (vraagControleAanAction). Het adres van de werklocatie gaat via /api/werkgever/branches (VestigingFormulier).

const profileSchema = z.object({
  role: z.string().trim().max(60).optional(),
  sector: z.string().trim().max(60).optional(),
  shortageFrequency: z.string().trim().max(60).optional(),
  urgency: z.string().trim().max(60).optional(),
  priorPlatform: z.string().trim().max(60).optional(),
  /** "Waarvan ken je ons?" (23 nov 2026) */
  heardFrom: z.string().trim().max(60).optional(),
  /** gekozen branches, komma-gescheiden ("horeca,retail"), en "1" als alle branches zijn gekozen */
  branches: z.string().trim().max(400).optional(),
  alleBranches: z.enum(["1", ""]).optional(),
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
  // alleen als er een branche-keuze meekomt (de org-stap), niet bij de andere stappen
  const keuze = p.data.branches !== undefined || p.data.alleBranches !== undefined
    ? maakBrancheKeuze({ alle: p.data.alleBranches === "1", branches: (p.data.branches ?? "").split(",").filter(Boolean) })
    : null;
  await saveOrgProfileExtra(tenantId, {
    onboarding: {
      ...cur.onboarding,
      ...(keuze ? { branches: keuze.branches, alleBranches: keuze.alle } : {}),
      ...(p.data.role ? { role: p.data.role } : {}),
      ...(p.data.sector ? { sector: p.data.sector } : {}),
      ...(p.data.shortageFrequency ? { shortageFrequency: p.data.shortageFrequency } : {}),
      ...(p.data.urgency ? { urgency: p.data.urgency } : {}),
      ...(p.data.priorPlatform ? { priorPlatform: p.data.priorPlatform } : {}),
      ...(p.data.heardFrom ? { heardFrom: p.data.heardFrom } : {}),
      ...(p.data.profileStepDone === "1" ? { profileStepDone: true } : {}),
      ...(p.data.coverStepDone === "1" ? { coverStepDone: true } : {}),
    },
  });
  revalidatePath("/werkgever");
  return { ok: true };
}
