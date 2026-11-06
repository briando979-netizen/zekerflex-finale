import { z } from "zod";
import { FindingActionKind, FindingSeverity } from "@prisma/client";

// ---------------------------------------------------------------------------
// Het antwoord van het model op een orchestratiecyclus lezen, soepel.
//
// Een model levert niet altijd precies wat je vraagt: tekst kan een object
// zijn, een bevinding kan een veld missen. Streng lezen betekende dat één
// scheve bevinding de hele ronde liet mislukken en er niets werd opgeslagen
// (6 nov: "invalid_type, expected string, received object"). Hoe kleiner het
// model — en met "alles gratis" draaien we op ons eigen, kleinere model — hoe
// vaker dat gebeurt. Daarom: maak er van wat er van te maken valt, sla over
// wat echt onbruikbaar is, en laat de ronde doorgaan.
// ---------------------------------------------------------------------------

/** Tekst die geen tekst is, leesbaar maken en afkorten. */
export const tekst = (max: number) =>
  z
    .preprocess((v) => {
      if (typeof v === "string") return v;
      if (v === null || v === undefined) return "";
      if (typeof v === "object") {
        try {
          return JSON.stringify(v);
        } catch {
          return "";
        }
      }
      return String(v);
    }, z.string())
    .transform((s) => s.slice(0, max));

export const findingSchema = z.object({
  severity: z.nativeEnum(FindingSeverity).catch(FindingSeverity.INFO),
  category: tekst(40).catch("general"),
  title: tekst(160),
  detail: tekst(2000).catch(""),
  actionKind: z.nativeEnum(FindingActionKind).catch(FindingActionKind.NONE),
  action: z.record(z.unknown()).nullish().catch(null),
});

/** Eén onbruikbare bevinding gooit de hele ronde niet weg: die slaan we over. */
export const responseSchema = z.object({
  summary: tekst(1000).catch(""),
  findings: z
    .array(z.unknown())
    .default([])
    .transform((rij) =>
      rij
        .flatMap((r) => {
          const p = findingSchema.safeParse(r);
          return p.success && p.data.title.trim() ? [p.data] : [];
        })
        .slice(0, 20),
    ),
});

export type OrchestratieAntwoord = z.infer<typeof responseSchema>;

/** Wat we opslaan als het model helemaal niets bruikbaars gaf. */
export const LEEG_ANTWOORD: OrchestratieAntwoord = {
  summary: "Het model gaf geen bruikbaar antwoord; deze ronde leverde niets op.",
  findings: [],
};
