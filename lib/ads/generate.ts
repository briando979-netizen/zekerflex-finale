import { z } from "zod";
import { chatJson } from "@/lib/ai/client";
import { SITE } from "@/lib/seo";

// ---------------------------------------------------------------------------
// Ad copy generation via the self-hosted LLM (lib/ai/client.ts — same
// sovereignty guard as the rest of the app, no cloud dependency). The system
// prompt hands the model a fixed, verified FACTS block and explicitly
// forbids inventing numbers/claims not in it, so a generated ad can't
// accidentally overclaim (e.g. a fabricated discount or statistic) — the
// model freely writes tone/structure, never new facts.
// ---------------------------------------------------------------------------

export type AdAudience = "freelancer" | "werkgever";

const FACTS = `
- ${SITE.name}: Nederlands platform voor flexwerk/zzp-opdrachten.
- Freelancers: gratis meedoen, gratis matching.
- Freelancers kiezen zelf hoe snel ze worden uitbetaald: direct na goedkeuring (4% van de factuur), binnen 3 werkdagen (2%), of gratis binnen 30 dagen.
- Werkgevers betalen € 3,50 platformkosten per gewerkt uur. Alleen als er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten.
- Elke opdracht loopt via een goedgekeurde modelovereenkomst (Wet DBA-proof).
- Werken zonder KVK is mogelijk als uitzendkracht via het ZekerFlex-uitzendbureau (wekelijkse verloning, StiPP-pensioen, ABU-fasensysteem).
- 100% in Nederland gehost, geen tussenpartijen.
`.trim();

const AUDIENCE_BRIEF: Record<AdAudience, string> = {
  freelancer: "Freelancers en flexwerkers die werk zoeken dat past bij hun vak en reistijd.",
  werkgever: "Werkgevers (horeca, retail, logistiek) die snel betrouwbaar personeel willen inhuren.",
};

export interface AdCopy {
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
}

const adCopySchema = z.object({
  headline: z.string().trim().min(3).max(90),
  subheadline: z.string().trim().min(3).max(140),
  body: z.string().trim().min(10).max(400),
  cta: z.string().trim().min(2).max(40),
});

export async function generateAdCopy(input: { audience: AdAudience; angle?: string }): Promise<AdCopy> {
  const system =
    `Je bent de marketingtekstschrijver van ${SITE.name}. Schrijf Nederlandstalige advertentietekst ` +
    `voor social media / display-advertenties.\n\n` +
    `FEITEN (gebruik ALLEEN deze, verzin geen cijfers, kortingen of claims die er niet staan):\n${FACTS}\n\n` +
    `Doelgroep: ${AUDIENCE_BRIEF[input.audience]}\n\n` +
    `Antwoord UITSLUITEND met JSON: {"headline": string (max 8 woorden, pakkend), ` +
    `"subheadline": string (max 15 woorden), "body": string (2-3 zinnen, max 60 woorden), ` +
    `"cta": string (max 4 woorden, bv. "Meld je gratis aan")}.`;

  const user = input.angle?.trim()
    ? `Invalshoek/thema voor deze advertentie: ${input.angle.trim()}`
    : "Geen specifieke invalshoek — schrijf een sterke algemene advertentie.";

  const result = await chatJson<unknown>({
    purpose: "ad-copy",
    temperature: 0.7,
    maxTokens: 400,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return adCopySchema.parse(result);
}
