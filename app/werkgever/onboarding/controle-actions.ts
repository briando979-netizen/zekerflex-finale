"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError } from "@/lib/errors";
import { vraagControleAan } from "@/lib/company/controle-aanvraag";
import type { ControleFouten } from "@/lib/company/gecontroleerd";

const aanvraagSchema = z.object({
  velden: z.record(z.string(), z.unknown()),
  keuzes: z.array(z.object({ offerId: z.string().min(1).max(128), shiftId: z.string().min(1).max(128) })).max(50),
});

export interface ControleActieUitkomst {
  ok: boolean;
  /** "gecontroleerd": het kan meteen verder; "aangevraagd": het bedrijf wacht op Beheer en krijgt bericht */
  status?: "gecontroleerd" | "aangevraagd";
  /** gewone Nederlandse zin (de server weet de taal van het venster niet) */
  error?: string;
  /** per veld "leeg" of "ongeldig": het venster zet er een tekst in zijn eigen taal bij */
  fouten?: ControleFouten;
}

/**
 * "Nog een paar laatste checks": het bedrijf vult zijn gegevens in omdat het iemand wil inplannen (23 nov 2026,
 * lib/company/controle-aanvraag.ts). De gekozen reacties worden bewaard en blijven openstaan. Alleen de beheerder van het bedrijf.
 */
export async function vraagControleAanAction(input: unknown): Promise<ControleActieUitkomst> {
  try {
    const parsed = aanvraagSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw." };
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) return { ok: false, error: "Geen organisatie gevonden voor je account." };
    const uit = await vraagControleAan({ userId: principal.userId, tenantId, raw: parsed.data.velden, keuzes: parsed.data.keuzes });
    revalidatePath("/werkgever");
    revalidatePath("/werkgever/diensten");
    return { ok: true, status: uit.status };
  } catch (err) {
    if (err instanceof AppError) {
      const fouten = (err.details as { fouten?: ControleFouten } | undefined)?.fouten;
      return { ok: false, error: err.message, ...(fouten ? { fouten } : {}) };
    }
    return { ok: false, error: "De gegevens konden niet worden opgeslagen. Probeer het opnieuw." };
  }
}
