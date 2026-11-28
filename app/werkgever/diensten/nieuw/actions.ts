"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { wisConceptVoorGebruiker } from "@/lib/klusconcept/server-opslag";
import { createShift, createShiftSchema, createShiftSchemaBelgie, type BelgieKlusInvoer } from "@/lib/shifts/create";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isBelgischContract, isBelgischeKlus } from "@/lib/belgie/klus-kern";
import { getDict } from "@/lib/i18n/server";

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
  // Een werklocatie in België (lib/belgie/klus-kern.ts): het Belgische schema (zonder de Nederlandse ondergrens) en het soort
  // contract uit het formulier (components/werkgever/BelgieKlusKeuze.tsx). Of de vestiging van dit bedrijf is, controleert createShift.
  const gekozenVestiging = adHocAddress ? null : String(formData.get("branchId") ?? "").trim();
  const belgisch = adHocAddress
    ? isBelgischeKlus(adHocAddress.postalCode)
    : gekozenVestiging
      ? isBelgischeKlus((await prisma.branch.findUnique({ where: { id: gekozenVestiging }, select: { postalCode: true } }).catch(() => null))?.postalCode)
      : false;
  const soort = formData.get("belgieContract");
  let belgie: BelgieKlusInvoer | null = null;
  if (belgisch) {
    if (!isBelgischContract(soort)) return { error: (await getDict()).belgie.kiesSoort };
    belgie = { soort, horeca: soort === "flexi" && formData.get("belgieHoreca") === "on" };
  }

  const parsed = (belgisch ? createShiftSchemaBelgie : createShiftSchema).safeParse({
    branchId: adHocAddress ? undefined : formData.get("branchId"),
    adHocAddress,
    templateKey: formData.get("templateKey") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dresscode: formData.get("dresscode") || undefined,
    extraInfo: formData.get("extraInfo") || undefined,
    viaUitzendbureau: formData.get("viaUitzendbureau") === "on",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    breakMinutes: formData.get("breakMinutes") ?? 0,
    hourlyRateCents: formData.get("hourlyRateCents"),
    positions: formData.get("positions") ?? 1,
    annuleerUren: formData.get("annuleerUren") || undefined,
    extraDates: extraDatesRaw ? extraDatesRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    poolId: formData.get("poolId") || undefined,
    autoAcceptFavorieten: formData.get("autoAcceptFavorieten") === "on",
    kostenplaats: formData.get("kostenplaats") || undefined,
    vaardigheden: String(formData.get("vaardigheden") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens." };
  }

  try {
    await createShift(principal, parsed.data, belgie);
    // het klusconcept van /klus-plaatsen dat bij het aanmelden is bewaard, is nu gebruikt (lib/klusconcept/server-opslag.ts)
    await wisConceptVoorGebruiker(principal.userId).catch(() => undefined);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "De dienst kon niet worden aangemaakt. Probeer het opnieuw." };
  }

  revalidatePath("/werkgever/diensten");
  revalidatePath("/werkgever");
  redirect("/werkgever/diensten");
}
