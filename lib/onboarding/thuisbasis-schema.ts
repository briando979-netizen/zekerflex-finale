import { z } from "zod";
import { isThuisland, postcodeGeldig, postcodeMelding } from "@/lib/geo/thuisland";

// ---------------------------------------------------------------------------
// De velden van de thuisbasis in de onboarding (/api/onboarding, het wallet-pad
// en de controle vooraf in /api/onboarding/thuisbasis): land (standaard NL),
// postcode en, alleen in het buitenland, de woonplaats. De Nederlandse
// postcoderegel geldt alleen in Nederland (lib/geo/thuisland.ts).
// Geen min/max-meldingen van zod zelf: die zijn Engels. De regels staan in
// controleerThuisbasis, met Nederlandse meldingen.
// ---------------------------------------------------------------------------

export const thuisbasisVelden = {
  postalCode: z.string().trim().max(20, "Vul een geldige postcode in"),
  country: z.string().trim().toUpperCase().optional(),
  city: z.string().trim().max(80, "Die woonplaats is te lang").optional(),
};

export function controleerThuisbasis(
  d: { postalCode: string; country?: string | undefined; city?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const land = d.country || "NL";
  if (!isThuisland(land)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "Kies een land uit de lijst" });
    return;
  }
  if (!postcodeGeldig(land, d.postalCode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["postalCode"], message: postcodeMelding(land) });
  }
  if (land !== "NL" && !d.city) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["city"], message: "Vul je woonplaats in" });
  }
}
