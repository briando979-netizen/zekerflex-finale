"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { updatePersonalInfo, updatePersonalInfoSchema } from "@/lib/profile/personal";
import { bewaarOpleiding } from "@/lib/onboarding/wie-ben-jij-opslag";
import type { Opleiding } from "@/lib/onboarding/opleiding";
import type { PersonalInfoCode } from "@/components/app/personal-info-texts";

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
  /** Nederlands, voor wie geen vertaling meegeeft */
  message: string;
  /** de werker-app zoekt er de tekst in zijn eigen taal bij (components/app/personal-info-texts.ts) */
  code?: PersonalInfoCode;
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
    const veld = parsed.error.issues[0]?.path[0];
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens.", code: veld === "fullName" ? "naam" : "mislukt" };
  }

  try {
    await updatePersonalInfo(principal.userId, parsed.data);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message, code: err.code === "NAAM_VASTGEZET" ? "naamVast" : "mislukt" };
    return { ok: false, message: "Opslaan is mislukt. Probeer het opnieuw.", code: "mislukt" };
  }

  revalidatePath("/dashboard/profiel");
  return { ok: true, message: "Gegevens opgeslagen.", code: "opgeslagen" };
}
