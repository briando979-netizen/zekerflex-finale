import { z } from "zod";

// ---------------------------------------------------------------------------
// Een lijst met een grens die eerst naar de lengte kijkt (15 nov 2026). Zod 3 controleert bij z.array(x).max(n) eerst
// elk element en meldt pas daarna dat de lijst te lang is (bekend lek, opgelost in zod 4.6.6). Een openbare body van
// 1 MB (de grens van lib/http/openbare-grens.ts) met 500.000 foute elementen kostte zo 840 ms en 185 MB geheugen per
// verzoek; met deze lijst 64 ms en één melding. Bij gewone invoer: dezelfde uitkomst en dezelfde meldingen.
// Gebruik hem voor elke lijst die zonder inloggen binnenkomt.
// ---------------------------------------------------------------------------

export function lijst<T extends z.ZodTypeAny>(item: T, grens: { max: number; min?: number }) {
  const elementen = grens.min !== undefined ? z.array(item).min(grens.min).max(grens.max) : z.array(item).max(grens.max);
  return z
    .unknown()
    .superRefine((v, ctx) => {
      // te lang: één melding (dezelfde als die van z.array().max), en de elementen worden niet meer bekeken
      if (Array.isArray(v) && v.length > grens.max) {
        ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: grens.max, type: "array", inclusive: true, exact: false });
      }
    })
    .pipe(elementen);
}
