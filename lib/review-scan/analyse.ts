import { z } from "zod";
import { chatJson, llmConfigProblem } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import { antwoordSjabloon, cijfer, themasUitReviews, type ScanReview, type Thema } from "@/lib/review-scan/model";

// ---------------------------------------------------------------------------
// Wat klanten zeggen, in gewone taal: een samenvatting, sterke punten,
// verbeterpunten en per review een antwoordvoorstel. Met de AI als die
// bereikbaar is, anders met de regels uit model.ts (thema's op trefwoorden,
// nette standaardantwoorden). De AI krijgt alleen de reviewteksten en de
// sterren, geen namen van reviewers; hij mag niets verzinnen.
// ---------------------------------------------------------------------------

export interface Analyse {
  bron: "ai" | "regels";
  samenvatting: string | null;
  sterk: string[];
  verbeter: string[];
  /** zelfde volgorde als de reviews */
  antwoorden: string[];
  themas: Thema[];
}

const aiSchema = z.object({
  samenvatting: z.string().min(10).max(600),
  sterk: z.array(z.string().min(3).max(200)).max(5),
  verbeter: z.array(z.string().min(3).max(200)).max(5),
  antwoorden: z.array(z.string().min(10).max(900)),
});

function regels(bedrijf: string, reviews: readonly ScanReview[]): Analyse {
  const themas = themasUitReviews(reviews);
  return {
    bron: "regels",
    samenvatting: null,
    sterk: themas.filter((t) => t.positief > 0 && t.negatief === 0).map((t) => t.label),
    verbeter: themas.filter((t) => t.negatief > 0).map((t) => t.label),
    antwoorden: reviews.map((r) => antwoordSjabloon(r, bedrijf)),
    themas,
  };
}

export async function analyseerReviews(input: { bedrijf: string; categorie: string | null; rating: number | null; aantal: number; reviews: readonly ScanReview[] }): Promise<Analyse> {
  const basis = regels(input.bedrijf, input.reviews);
  if (input.reviews.length === 0 || llmConfigProblem()) return basis;
  const lijst = input.reviews.map((r, i) => `Review ${i + 1} (${r.rating} sterren${r.wanneer ? `, ${r.wanneer}` : ""}): ${r.tekst.replace(/\s+/g, " ").slice(0, 700) || "(geen tekst)"}`).join("\n");
  const system =
    `Je helpt een Nederlands bedrijf zijn Google-reviews te begrijpen en te beantwoorden. Schrijf in gewoon, vriendelijk Nederlands (je/jij), zonder jargon.\n` +
    `Regels: gebruik ALLEEN wat in de reviews staat; verzin geen feiten, namen, kortingen of beloftes. Noem geen reviewers bij naam. ` +
    `Een antwoord is persoonlijk, kort (max 70 woorden), bedankt de klant, gaat in op wat die schreef, en biedt bij kritiek een gesprek buiten Google aan zonder schuld af te schuiven. Onderteken met "Groet, het team van ${input.bedrijf}".\n` +
    `Antwoord UITSLUITEND met JSON: {"samenvatting": string (2-3 zinnen: wat klanten waarderen en wat beter kan), "sterk": string[] (max 4 korte punten), "verbeter": string[] (max 4 korte, concrete verbeterpunten voor het bedrijf), "antwoorden": string[] (precies één antwoord per review, in dezelfde volgorde)}.`;
  const user =
    `Bedrijf: ${input.bedrijf}${input.categorie ? ` (${input.categorie})` : ""}. Score op Google: ${input.rating === null ? "nog geen" : `${cijfer(input.rating)} uit ${input.aantal} reviews`}.\n` +
    `Google toont deze ${input.reviews.length} reviews:\n${lijst}`;
  try {
    const raw = await chatJson<unknown>({
      purpose: "review-scan",
      temperature: 0.4,
      maxTokens: 1400,
      retry: false,
      timeoutMs: 25_000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const ai = aiSchema.parse(raw);
    return {
      bron: "ai",
      samenvatting: ai.samenvatting.trim(),
      sterk: ai.sterk.map((s) => s.trim()).filter(Boolean),
      verbeter: ai.verbeter.map((s) => s.trim()).filter(Boolean),
      // ontbreekt er een antwoord, dan het standaardantwoord voor die review
      antwoorden: input.reviews.map((r, i) => ai.antwoorden[i]?.trim() || antwoordSjabloon(r, input.bedrijf)),
      themas: basis.themas,
    };
  } catch (err) {
    logger.warn("review-scan analyse viel terug op regels", { error: (err as Error).message.slice(0, 160) });
    return basis;
  }
}
