import { z } from "zod";
import { chatJson } from "@/lib/ai/client";
import { QUERIES } from "@/lib/admin-console/queries";
import { MUTATIONS } from "@/lib/admin-console/mutations";
import type { ParsedIntent } from "@/lib/admin-console/types";

// ---------------------------------------------------------------------------
// Turn a Dutch admin question into exactly one registry entry via the
// self-hosted LLM. The model only ever chooses a NAME + PARAMS from a fixed
// catalogue; it never produces a query. Anything it can't map -> "unknown".
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Je bent de intent-parser van de ZekerFlex admin-console.
Je krijgt een vraag of opdracht van een platformbeheerder in het Nederlands.
Kies PRECIES EEN item uit de catalogus hieronder, of geef "unknown".

Regels:
- Antwoord UITSLUITEND met een JSON-object, geen uitleg.
- Vorm: {"kind":"query"|"mutation"|"unknown","name":string,"params":object,"reason":string}
- "query" = alleen data ophalen. "mutation" = data wijzigen.
- Vul "params" exact volgens de parameterhint van het gekozen item. Laat optionele params weg als ze niet genoemd zijn.
- Kies "unknown" met een korte "reason" als niets past of als de vraag onduidelijk is.
- Verzin nooit een naam die niet in de catalogus staat.`;

export function buildCatalog(): string {
  const q = Object.values(QUERIES)
    .map((h) => `- ${h.name} [query]: ${h.description} Params: ${h.paramsHint}`)
    .join("\n");
  const m = Object.values(MUTATIONS)
    .map((h) => `- ${h.name} [mutation]: ${h.description} Params: ${h.paramsHint}`)
    .join("\n");
  return `QUERIES (alleen-lezen):\n${q}\n\nMUTATIES (wijzigen data):\n${m}`;
}

const rawIntentSchema = z.object({
  kind: z.enum(["query", "mutation", "unknown"]),
  name: z.string().max(80).optional(),
  params: z.record(z.unknown()).optional(),
  reason: z.string().max(400).optional(),
});

/**
 * @throws when the LLM is unreachable (AppError upstream from `chatJson`) - the
 *   orchestrator turns that into a "reasoning layer offline" clarification.
 */
export async function parseIntent(question: string): Promise<ParsedIntent> {
  const raw = await chatJson<unknown>({
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${buildCatalog()}` },
      { role: "user", content: question },
    ],
    temperature: 0,
    maxTokens: 400,
  });

  const parsed = rawIntentSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "unknown", reason: "Kon het antwoord van de parser niet lezen." };
  }
  const data = parsed.data;

  if (data.kind === "unknown" || !data.name) {
    return {
      kind: "unknown",
      reason: data.reason ?? "Geen passende actie gevonden.",
    };
  }

  const registry = data.kind === "query" ? QUERIES : MUTATIONS;
  if (!(data.name in registry)) {
    return {
      kind: "unknown",
      reason: `De parser koos een onbekende actie ("${data.name}").`,
    };
  }

  return {
    kind: data.kind,
    name: data.name,
    params: data.params ?? {},
  };
}
