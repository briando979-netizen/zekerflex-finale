import { z } from "zod";
import { chatJson } from "@/lib/ai/client";
import { SITE } from "@/lib/seo";
import { llmConfigProblem } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

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
- Freelancers kiezen zelf hoe snel de betaalopdracht wordt ingediend: direct na goedkeuring (4% van de factuur), binnen 3 werkdagen (2%), of gratis wachten tot de opdrachtgever betaalt. Externe bankverwerking kan langer duren.
- Werkgevers betalen € 3,50 platformkosten per gewerkt uur. Alleen als er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten.
- ZekerFlex legt afspraken per relatie vast en biedt Wet DBA-risicosignalering; de feitelijke werkwijze blijft bepalend voor de arbeidsrelatie.
- Werken zonder KVK is mogelijk als uitzendkracht via het ZekerFlex-uitzendbureau (wekelijkse verloning, StiPP-pensioen, ABU-fasensysteem).
- Werkgevers krijgen staffelkorting bij veel uren: van € 3,50 tot € 2,50 per uur.
- Werkgevers die snelle uitbetaling aanbieden (na kredietcheck) krijgen sneller reacties op hun klussen.
- ZekerFlex Bank: eigen rekening in de app, verdiensten direct erop, gratis virtuele betaalpas, eerste 30 dagen gratis.
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

// Hand-written, fact-checked ads (only claims from FACTS) — used when the
// language model isn't reachable, so the generator always delivers.
const TEMPLATES: Record<AdAudience, AdCopy[]> = {
  freelancer: [
    { headline: "Werk dat past bij jou", subheadline: "Kies zelf je klussen, dichtbij huis en op jouw tijden.", body: "Meedoen is gratis. Je kiest zelf hoe snel je betaald wordt — zelfs direct na goedkeuring van je uren. Afspraken worden per opdrachtgever vastgelegd.", cta: "Meld je gratis aan" },
    { headline: "Vandaag gewerkt, vandaag betaald", subheadline: "Je verdiensten direct op je eigen ZekerFlex Bank.", body: "Ontvang je loon direct op je ZekerFlex Bank-rekening met gratis virtuele betaalpas. De eerste 30 dagen zijn gratis.", cta: "Start gratis" },
    { headline: "Geen KVK? Toch flexibel werken", subheadline: "Werk als uitzendkracht via het ZekerFlex-uitzendbureau.", body: "Zonder KVK werk je als uitzendkracht: wekelijkse verloning, StiPP-pensioen en het ABU-fasensysteem geregeld.", cta: "Bekijk klussen" },
  ],
  werkgever: [
    { headline: "Personeel nodig? Binnen minuten geregeld", subheadline: "Plaats een dienst, betrouwbare krachten reageren direct.", body: "Je betaalt € 3,50 per gewerkt uur, alleen als er echt iemand werkt. Geen abonnement, geen opstartkosten.", cta: "Plaats je eerste dienst" },
    { headline: "Hoe meer uren, hoe goedkoper", subheadline: "Staffelkorting tot € 2,50 per uur.", body: "Bij meer uren per maand daalt je tarief automatisch van € 3,50 naar € 2,50 per uur. ZekerFlex legt afspraken vast en signaleert Wet DBA-risico's.", cta: "Bekijk de prijzen" },
    { headline: "Sneller je klussen gevuld", subheadline: "Bied je krachten snelle uitbetaling aan.", body: "Werkgevers die snelle uitbetaling aanbieden krijgen sneller reacties. Je betaalt alleen platformkosten als er daadwerkelijk iemand werkt.", cta: "Meld je bedrijf aan" },
  ],
};

export function templateAd(audience: AdAudience, angle?: string): AdCopy {
  const list = TEMPLATES[audience];
  const a = (angle ?? "").toLowerCase();
  const pick =
    (/bank|betaal|geld|snel/.test(a) && list.find((t) => /betaald|bank|snelle/i.test(t.headline + t.subheadline))) ||
    (/korting|prijs|goedkoop|staffel/.test(a) && list.find((t) => /korting|goedkoper/i.test(t.headline + t.subheadline))) ||
    (/kvk|uitzend/.test(a) && list.find((t) => /KVK|uitzend/i.test(t.headline + t.subheadline))) ||
    list[Math.floor(Math.random() * list.length)]!;
  return pick;
}

export async function generateAdCopy(input: { audience: AdAudience; angle?: string }): Promise<AdCopy> {
  if (llmConfigProblem()) return templateAd(input.audience, input.angle);
  try {
    return await generateWithModel(input);
  } catch (err) {
    logger.warn("ad copy fell back to template", { error: (err as Error).message });
    return templateAd(input.audience, input.angle);
  }
}

async function generateWithModel(input: { audience: AdAudience; angle?: string }): Promise<AdCopy> {
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
    retry: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return adCopySchema.parse(result);
}
