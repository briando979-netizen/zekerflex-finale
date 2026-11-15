import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRATIS_GRENZEN, isPraatje, jarvisBerichten, jarvisFoutTekst, statusAlsAchtergrond } from "@/lib/jarvis/berichten";
import { JARVIS_PERSONA, JARVIS_PERSONA_KORT } from "@/lib/jarvis/persona";

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
  vraag: "Hoeveel klussen staan er open?",
  gratis,
});

describe("jarvisBerichten", () => {
  it("vaste delen eerst (persona, voorbeelden), dan de status, het gesprek en de vraag", () => {
    const b = jarvisBerichten(invoer(false));
    expect(b[0]).toEqual({ role: "system", content: "PERSONA" });
    expect(b[1]?.content.startsWith("Voorbeelden van goede eerdere antwoorden:")).toBe(true);
    expect(b[2]).toEqual({ role: "system", content: statusAlsAchtergrond("LIVE PLATFORMSTATUS (2026-11-15T00:28:00Z): db=ok") });
    expect(b[2]?.content).toContain("alleen voor als de beheerder ernaar vraagt");
    expect(b.at(-1)).toEqual({ role: "user", content: "Hoeveel klussen staan er open?" });
    expect(b.filter((x) => x.role !== "system")).toHaveLength(9);
    // de status staat er één keer in (niet "LIVE PLATFORMSTATUS: LIVE PLATFORMSTATUS")
    expect(b.map((x) => x.content).join("\n").match(/LIVE PLATFORMSTATUS/g)).toHaveLength(1);
  });

  it("met alles gratis korter: geen voorbeelden, de laatste twee beurten, ingekort", () => {
    const b = jarvisBerichten(invoer(true));
    expect(b.some((x) => x.content.startsWith("Voorbeelden van goede eerdere antwoorden"))).toBe(false);
    const gesprek = b.filter((x) => x.role === "user" || x.role === "assistant").slice(0, -1);
    expect(gesprek.map((x) => x.content.slice(0, 9))).toEqual(["vraag 3", "antwoord ", "vraag 4", "antwoord "]);
    expect(Math.max(...gesprek.map((x) => x.content.length))).toBeLessThanOrEqual(GRATIS_GRENZEN.antwoordTekens + 1);
    const tekens = (g: boolean) => jarvisBerichten(invoer(g)).reduce((n, x) => n + x.content.length, 0);
    expect(tekens(true)).toBeLessThan(tekens(false) / 2);
  });

  it("bij een groet of praatje gaat de status niet mee (het model plakte hem anders terug); bij een vraag wel", () => {
    for (const groet of ["Hallo", "hoi!", "Goedemorgen Jarvis, alles goed?", "bedankt", "ok", "Hoe gaat het?"]) {
      expect(isPraatje(groet), groet).toBe(true);
      const b = jarvisBerichten({ ...invoer(true), vraag: groet });
      expect(b.some((x) => x.content.includes("LIVE PLATFORMSTATUS")), groet).toBe(false);
    }
    expect(isPraatje("Hoeveel klussen staan er open?")).toBe(false);
    expect(isPraatje("Hoe gaat het met de werkgevers in Groningen?")).toBe(false);
    expect(jarvisBerichten({ ...invoer(true), vraag: "Hoeveel klussen staan er open?" }).some((x) => x.content.includes("LIVE PLATFORMSTATUS"))).toBe(true);
  });

  it("de persona noemt de status achtergrond, niet iets om te herhalen", () => {
    expect(JARVIS_PERSONA_KORT).toContain("noem die cijfers alleen als ernaar gevraagd wordt");
    expect(JARVIS_PERSONA).toContain("Noem die cijfers alleen als ernaar gevraagd wordt");
    expect(JARVIS_PERSONA).not.toContain("gebruik die.");
  });

  it("zonder status of voorbeelden: die berichten vallen weg", () => {
    const b = jarvisBerichten({ ...invoer(false), status: "", voorbeelden: [] });
    expect(b.filter((x) => x.role === "system")).toEqual([{ role: "system", content: "PERSONA" }]);
  });
});

describe("de korte persona", () => {
  it("hooguit een kwart van de volle, met dezelfde kernregels", () => {
    expect(JARVIS_PERSONA_KORT.length).toBeLessThan(JARVIS_PERSONA.length / 4);
    for (const regel of ["ZekerFlex", "Nederlands", "Verzin geen", "voorstel"]) expect(JARVIS_PERSONA_KORT).toContain(regel);
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
    expect(lees("app/api/admin/jarvis/quick/route.ts")).toContain("jarvisFoutTekst((err as Error).message)");
    expect(lees("lib/jarvis/core.ts")).toContain("messages: jarvisBerichten({ persona: gratisAan() ? JARVIS_PERSONA_KORT : JARVIS_PERSONA");
    // met alles gratis geen router-ronde voor gewone vragen, en de korte persona
    expect(lees("app/api/admin/jarvis/quick/route.ts")).toContain("if (!gratis && !route && prompt.split(/\\s+/).length > 6) {");
    expect(lees("app/api/admin/jarvis/quick/route.ts")).toContain("persona: gratis ? JARVIS_PERSONA_KORT : JARVIS_PERSONA");
  });
});
