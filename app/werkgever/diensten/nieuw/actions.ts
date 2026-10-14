"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { createShift, createShiftSchema } from "@/lib/shifts/create";
import { AppError } from "@/lib/errors";

export interface NewShiftState {
  error: string | null;
}

export async function createShiftAction(
  _prev: NewShiftState,
  formData: FormData,
): Promise<NewShiftState> {
  const principal = await requirePrincipal();
  requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

  const extraDatesRaw = String(formData.get("extraDates") ?? "").trim();
  const adHocLabel = String(formData.get("adHocLabel") ?? "").trim();
  const adHocAddress = adHocLabel
    ? {
        label: adHocLabel,
        postalCode: String(formData.get("adHocPostalCode") ?? ""),
        city: String(formData.get("adHocCity") ?? ""),
        latitude: Number(formData.get("adHocLatitude")),
        longitude: Number(formData.get("adHocLongitude")),
      }
    : undefined;
  const parsed = createShiftSchema.safeParse({
    branchId: adHocAddress ? undefined : formData.get("branchId"),
    adHocAddress,
    templateKey: formData.get("templateKey") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dresscode: formData.get("dresscode") || undefined,
    viaUitzendbureau: formData.get("viaUitzendbureau") === "on",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    breakMinutes: formData.get("breakMinutes") ?? 0,
    hourlyRateCents: formData.get("hourlyRateCents"),
    positions: formData.get("positions") ?? 1,
    extraDates: extraDatesRaw ? extraDatesRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    poolId: formData.get("poolId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens." };
  }

  try {
    await createShift(principal, parsed.data);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "De dienst kon niet worden aangemaakt. Probeer het opnieuw." };
  }

  revalidatePath("/werkgever/diensten");
  revalidatePath("/werkgever");
  redirect("/werkgever/diensten");
}
