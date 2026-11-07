import { topExamples } from "@/lib/learn/store";
import { PUBLIEK_SYSTEEM } from "@/lib/chat/publiek-systeem";

type Bericht = { role: "system"; content: string };

/**
 * Het vaste begin van elk gesprek in de openbare chat: de instructie en de
 * voorbeelden van goede antwoorden. Altijd vooraan en letterlijk gelijk, zodat
 * het eigen model dit begin niet bij elke vraag opnieuw hoeft in te lezen.
 */
export async function vastBegin(): Promise<Bericht[]> {
  const voorbeelden = await topExamples("public", 2).catch(() => []);
  return [
    { role: "system", content: PUBLIEK_SYSTEEM },
    ...(voorbeelden.length
      ? [{ role: "system" as const, content: "Voorbeelden van eerdere goede antwoorden (gebruik dezelfde toon en feiten):\n" + voorbeelden.map((e) => `V: ${e.q}\nA: ${e.a}`).join("\n\n") }]
      : []),
  ];
}
