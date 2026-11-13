"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { updatePersonalInfo, updatePersonalInfoSchema } from "@/lib/profile/personal";
import { bewaarOpleiding } from "@/lib/onboarding/wie-ben-jij-opslag";
import type { Opleiding } from "@/lib/onboarding/opleiding";

/**
 * De opleiding in het profiel (13 nov 2026: uit stap 1 van de onboarding gehaald). null = wissen. Geeft de bewaarde
 * stand terug, die het scherm overneemt; de tekst bij een fout kiest het scherm zelf, in de taal van de werker.
 */
export async function bewaarOpleidingAction(invoer: Opleiding | null): Promise<{ ok: boolean; opleiding: Opleiding | null }> {
  const principal = await requirePrincipal();
  try {
    const opleiding = await bewaarOpleiding(principal.userId, invoer);
    revalidatePath("/dashboard/profiel");
    return { ok: true, opleiding };
  } catch {
    return { ok: false, opleiding: null };
  }
}

export interface PersonalInfoResult {
  ok: boolean;
  message: string;
}

export async function updatePersonalInfoAction(
  _prev: PersonalInfoResult,
  formData: FormData,
): Promise<PersonalInfoResult> {
  const principal = await requirePrincipal();
  const parsed = updatePersonalInfoSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens." };
  }

  try {
    await updatePersonalInfo(principal.userId, parsed.data);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Opslaan is mislukt. Probeer het opnieuw." };
  }

  revalidatePath("/dashboard/profiel");
  return { ok: true, message: "Gegevens opgeslagen." };
}
