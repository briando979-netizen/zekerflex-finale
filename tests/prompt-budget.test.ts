import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRATIS_PROMPT_BUDGET, berichtenTokens, kiesBinnenBudget, schatTokens, woordOverlap } from "@/lib/ai/prompt-budget";
import { breinBerichtenGratis } from "@/lib/brain/prompt-gratis";
import { bouwSysteem, sitechatBinnenBudget, type Fragment } from "@/lib/sitechat/regels";

// Het eigen model leest per aanvraag 2048 tokens en kapte de breinprompt (±5.400 tokens) stil af (gemeten 12-13 nov).
// Bij alles gratis kiezen brein en sitechat nu zelf wat erin komt: beste eerst, tot het budget, ±450 tokens voor het
// antwoord, niets afgekapt. Bij Gemini verandert er niets.

const tekst = (n: number, woord = "tekst") => `${woord} `.repeat(Math.ceil(n / (woord.length + 1))).slice(0, n);

describe("het budget", () => {
  it("2048 min 450 voor het antwoord; schatter tekens / 3,4", () => {
    expect(GRATIS_PROMPT_BUDGET).toBe(1598);
    expect(schatTokens("x".repeat(340))).toBe(100);
  });

  it("kiest beste eerst, slaat wat niet past heel over en kapt niets af", () => {
    const stukken = [{ t: 60 }, { t: 50 }, { t: 30 }];
    expect(kiesBinnenBudget(stukken, (s) => s.t, 90)).toEqual([{ t: 60 }, { t: 30 }]);
  });

  it("woordoverlap sorteert vaste kennis op de vraag", () => {
    expect(woordOverlap("hoe vraag ik vakantiegeld aan", "• Vakantiegeld — je vraagt het aan via loon")).toBeGreaterThan(woordOverlap("hoe vraag ik vakantiegeld aan", "• Inchecken — met de QR-code"));
  });
});

describe("brein bij alles gratis", () => {
  const pakket = [
    `• Vakantiegeld aanvragen — ${tekst(900, "vakantiegeld")}`,
    ...Array.from({ length: 30 }, (_, i) => `• Onderwerp ${i} — ${tekst(400, `ander${i}`)}`),
  ].join("\n");
  const invoer = {
    systeem: tekst(700, "regel"),
    gegevens: [`### mijn uren\n${tekst(600, "uren")}`],
    hits: [
      { title: "Beste fragment", source: "FAQ", excerpt: tekst(700, "vakantiegeld") },
      { title: "Tweede", source: "FAQ", excerpt: tekst(700, "loon") },
      { title: "Derde", source: "FAQ", excerpt: tekst(700, "loon") },
      { title: "Vierde", source: "FAQ", excerpt: tekst(700, "loon") },
    ],
    pakket,
    geheugen: Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: tekst(500, "eerder") })),
    vraag: "Hoe vraag ik mijn vakantiegeld aan?",
  };

  it("blijft onder het budget (met ruimte voor het antwoord), met het hoogst scorende fragment erin", () => {
    const b = breinBerichtenGratis(invoer);
    expect(berichtenTokens(b)).toBeLessThanOrEqual(GRATIS_PROMPT_BUDGET);
    const alles = b.map((m) => m.content).join("\n");
    expect(alles).toContain("[1] Beste fragment (FAQ)");
    expect(b[0]?.content).toBe(invoer.systeem);
    expect(b.at(-1)).toEqual({ role: "user", content: invoer.vraag });
    // vaste kennis die niets met de vraag te maken heeft, blijft eruit
    expect(alles).not.toContain("Onderwerp ");
    expect(b.filter((m) => m.role !== "system" && m.content !== invoer.vraag).length).toBeLessThanOrEqual(2);
  });

  it("zonder alles gratis: de berichten van het brein zijn zoals voorheen (kennispakket eerst, 8 beurten)", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/brain/index.ts"), "utf8");
    expect(bron).toMatch(/gratisAan\(\)\s*\?\s*breinBerichtenGratis\(/);
    expect(bron).toMatch(/:\s*\[\s*\/\/ CAG: the byte-stable knowledge pack FIRST[^\n]*\n\s*packMessage\(role\),/);
    expect(bron).toMatch(/\.\.\.memory\.slice\(-8\)/);
  });
});

describe("sitechat bij alles gratis", () => {
  const site = { bedrijf: "Bakkerij De Test", omschrijving: tekst(200, "brood") };
  const fragmenten: Fragment[] = [
    { titel: "Openingstijden", tekst: tekst(300, "open"), altijd: true },
    { titel: "Beste antwoord", tekst: tekst(900, "taart") },
    ...Array.from({ length: 5 }, (_, i) => ({ titel: `Fragment ${i}`, tekst: tekst(1200, `iets${i}`) })),
  ];
  const historie = Array.from({ length: 10 }, (_, i) => ({ rol: i % 2 ? "ai" : "gast", tekst: tekst(1400, "gesprek") }));

  it("onder het budget, met het vaste en het best passende fragment erin, en de laatste vraag altijd mee", () => {
    const p = sitechatBinnenBudget(site, fragmenten, historie);
    const tokens = schatTokens(p.systeem) + berichtenTokens(p.historie.map((b) => ({ content: b.tekst.slice(0, 1500) })));
    expect(tokens).toBeLessThanOrEqual(GRATIS_PROMPT_BUDGET);
    expect(p.systeem).toContain("## Openingstijden");
    expect(p.systeem).toContain("## Beste antwoord");
    expect(p.historie.at(-1)).toBe(historie.at(-1));
    expect(p.historie.length).toBeLessThan(historie.length);
  });

  it("zonder alles gratis: zoals voorheen, alle fragmenten en de laatste 10 berichten", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/sitechat/antwoord.ts"), "utf8");
    expect(bron).toMatch(/gratisAan\(\) \? sitechatBinnenBudget\(site, fragmenten, v\.berichten\.slice\(-10\)\) : \{ systeem: bouwSysteem\(site, fragmenten\), historie: v\.berichten\.slice\(-10\) \}/);
    expect(bron).toMatch(/gratisAan\(\) \? sitechatBinnenBudget\(site, fragmenten, historie\) : \{ systeem: bouwSysteem\(site, fragmenten\), historie \}/);
    expect(bouwSysteem(site, fragmenten)).toContain("## Fragment 4");
  });
});
