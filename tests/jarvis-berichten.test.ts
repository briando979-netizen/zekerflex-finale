import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRATIS_GRENZEN, jarvisBerichten, jarvisFoutTekst } from "@/lib/jarvis/berichten";

// Jarvis op het eigen model (15 nov): eerst wat vastligt (persona, voorbeelden), daarna wat wisselt (status met tijdstip,
// gesprek, vraag), zodat het model het begin kan hergebruiken; met "alles gratis" korter. Een technische fout wordt een
// gewone zin.

const invoer = (gratis: boolean) => ({
  persona: "PERSONA",
  status: "LIVE PLATFORMSTATUS (2026-11-15T00:28:00Z): db=ok",
  voorbeelden: [
    { q: "v1", a: "a1" },
    { q: "v2", a: "a2".repeat(400) },
  ],
  geschiedenis: [1, 2, 3, 4].flatMap((n) => [
    { role: "user" as const, content: `vraag ${n}` },
    { role: "assistant" as const, content: `antwoord ${n} `.repeat(100) },
  ]),
  vraag: "Hoe gaat het?",
  gratis,
});

describe("jarvisBerichten", () => {
  it("vaste delen eerst (persona, voorbeelden), dan de status, het gesprek en de vraag", () => {
    const b = jarvisBerichten(invoer(false));
    expect(b[0]).toEqual({ role: "system", content: "PERSONA" });
    expect(b[1]?.content.startsWith("Voorbeelden van goede eerdere antwoorden:")).toBe(true);
    expect(b[2]).toEqual({ role: "system", content: "LIVE PLATFORMSTATUS (2026-11-15T00:28:00Z): db=ok" });
    expect(b.at(-1)).toEqual({ role: "user", content: "Hoe gaat het?" });
    expect(b.filter((x) => x.role !== "system")).toHaveLength(9);
    // de status staat er één keer in (niet "LIVE PLATFORMSTATUS: LIVE PLATFORMSTATUS")
    expect(b.map((x) => x.content).join("\n").match(/LIVE PLATFORMSTATUS/g)).toHaveLength(1);
  });

  it("met alles gratis korter: één voorbeeld, de laatste twee beurten, ingekort", () => {
    const b = jarvisBerichten(invoer(true));
    expect(b[1]?.content).toContain("1. V: v1");
    expect(b[1]?.content).not.toContain("2. V:");
    const gesprek = b.filter((x) => x.role === "user" || x.role === "assistant").slice(0, -1);
    expect(gesprek.map((x) => x.content.slice(0, 9))).toEqual(["vraag 3", "antwoord ", "vraag 4", "antwoord "]);
    expect(Math.max(...gesprek.map((x) => x.content.length))).toBeLessThanOrEqual(GRATIS_GRENZEN.antwoordTekens + 1);
    const tekens = (g: boolean) => jarvisBerichten(invoer(g)).reduce((n, x) => n + x.content.length, 0);
    expect(tekens(true)).toBeLessThan(tekens(false) / 2);
  });

  it("zonder status of voorbeelden: die berichten vallen weg", () => {
    const b = jarvisBerichten({ ...invoer(false), status: "", voorbeelden: [] });
    expect(b.filter((x) => x.role === "system")).toEqual([{ role: "system", content: "PERSONA" }]);
  });
});

describe("jarvisFoutTekst", () => {
  it("geen eerste woord of onbereikbaar: de server is druk; anders: opnieuw proberen", () => {
    expect(jarvisFoutTekst("LLM gaf geen eerste woord binnen 50000ms")).toContain("niet snel genoeg");
    expect(jarvisFoutTekst("LLM-stroom afgebroken vóór het eerste woord (x)")).toContain("niet snel genoeg");
    expect(jarvisFoutTekst("LLM stream HTTP 400: bad request")).toContain("Probeer het opnieuw");
  });
});

describe("in de routes", () => {
  it("het snelle antwoord en het volledige antwoord bouwen hun berichten met jarvisBerichten", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    expect(lees("app/api/admin/jarvis/quick/route.ts")).toContain("jarvisBerichten({ persona: JARVIS_PERSONA");
    expect(lees("app/api/admin/jarvis/quick/route.ts")).toContain("jarvisFoutTekst((err as Error).message)");
    expect(lees("lib/jarvis/core.ts")).toContain("messages: jarvisBerichten({ persona: JARVIS_PERSONA");
  });
});
