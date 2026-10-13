"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { updatePersonalInfo, updatePersonalInfoSchema } from "@/lib/profile/personal";

export interface PersonalInfoResult {
  ok: boolean;
  message: string;
}

export async function updateEmployerPersonalInfoAction(
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

  revalidatePath("/werkgever/account");
  return { ok: true, message: "Gegevens opgeslagen." };
}
