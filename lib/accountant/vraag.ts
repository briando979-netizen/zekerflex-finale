import { z } from "zod";
import { chatJson, llmConfigProblem } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import { tekst } from "@/lib/orchestration/antwoord";
import { zoekKennis } from "@/lib/accountant/kennis";
import { antwoordUitBronnen, bedragenKloppen, onbekend, type VraagAntwoord } from "@/lib/accountant/antwoord";
import { herkenCijfervraag } from "@/lib/accountant/cijfervraag";
import { beantwoordCijfervraag } from "@/lib/accountant/cijfers";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Vraagbalk van de AI-accountant. Stap 1: zoek in de kennisbank (lib/accountant/kennis.ts). Niets
// gevonden: eerlijk "weet ik niet" met een kant-en-klare vraag voor een mens. Wel gevonden: het eigen
// model (of de reserve, lib/ai) schrijft een kort antwoord UITSLUITEND uit die regels. Noemt het
// bedragen die niet in de bronnen staan, zegt het zelf dat de bronnen niet volstaan, of is het model
// er niet: dan komen de bronregels zelf, zonder verzinsels. Een vraag naar de eigen cijfers of termijnen
// (lib/accountant/cijfervraag.ts) beantwoordt de boekhouding zelf, zonder model.
// ---------------------------------------------------------------------------

const modelAntwoord = z.object({
  antwoord: tekst(900),
  volstaat: z.preprocess((v) => v !== false && v !== "false" && v !== "nee", z.boolean()),
});

export async function beantwoordVraag(vraagRuw: string): Promise<VraagAntwoord> {
  const vraag = vraagRuw.trim().slice(0, 500);
  // Eerst: gaat het over de eigen cijfers of termijnen? Dan antwoordt de boekhouding zelf, zonder model.
  const cijfervraag = herkenCijfervraag(vraag, amsterdamDayKey(new Date()));
  if (cijfervraag) return beantwoordCijfervraag(cijfervraag);
  const hits = zoekKennis(vraag);
  if (hits.length === 0) return onbekend(vraag);
  if (llmConfigProblem()) return antwoordUitBronnen(hits);

  const bronnen = hits.map((h, i) => `[${i + 1}] ${h.regel.title}\n${h.regel.text}`).join("\n\n");
  try {
    const raw = await chatJson<unknown>({
      purpose: "accountant-vraag",
      temperature: 0.1,
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Je helpt de bestuurder van zekerflex, Inc. (Delaware; bestuurder woont in Nederland) in gewoon Nederlands, zonder jargon. " +
            "Antwoord UITSLUITEND met wat in de bronnen hieronder staat, in hooguit 120 woorden. Noem geen bedrag, percentage, datum of regel die niet in de bronnen staat. " +
            "Je bent geen accountant of belastingadviseur: sluit af met één zin dat een mens dit moet bevestigen als het om een beslissing gaat. " +
            'Volstaan de bronnen niet voor de vraag, zet dan "volstaat" op false. Antwoord als JSON: {"antwoord": "...", "volstaat": true}.\n\nBRONNEN\n' +
            bronnen,
        },
        { role: "user", content: vraag },
      ],
    });
    const r = modelAntwoord.parse(raw);
    if (!r.volstaat || r.antwoord.trim().length < 20) return onbekend(vraag);
    if (!bedragenKloppen(r.antwoord, hits, vraag)) return antwoordUitBronnen(hits);
    return {
      soort: "antwoord",
      tekst: r.antwoord.trim(),
      bronnen: hits.map((h) => ({ naam: h.regel.bron.naam, url: h.regel.bron.url, zekerheid: h.regel.zekerheid })),
      door: "model",
    };
  } catch (e) {
    logger.warn(`accountant-vraag: model faalde, antwoord uit de bronnen (${e instanceof Error ? e.message : String(e)})`);
    return antwoordUitBronnen(hits);
  }
}
