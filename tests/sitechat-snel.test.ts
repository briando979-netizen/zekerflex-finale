import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { GRATIS_PROMPT_BUDGET, schatTokens } from "@/lib/ai/prompt-budget";
import { SITECHAT_SNEL_BUDGET, bouwSysteem, kiesFragmenten, sitechatBinnenBudget } from "@/lib/sitechat/regels";
import { smileyappKennis } from "@/lib/voorstel/smileyapp-chat";

// De chat op een site met het eigen model: 19 nov 2026 gemeten 14 tot 28 s tot het eerste woord, omdat het model een
// vraag van ruim 1000 tokens op de CPU moet lezen. Een kleiner budget voor de sitechat houdt de vraag kort, zonder het
// juiste fragment kwijt te raken.

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), "utf8");

describe("sitechat: korte vraag aan het eigen model", () => {
  it("gebruikt een budget dat duidelijk kleiner is dan wat het eigen model aankan", () => {
    expect(SITECHAT_SNEL_BUDGET).toBeLessThanOrEqual(Math.floor(GRATIS_PROMPT_BUDGET * 0.6));
    const s = lees("lib/sitechat/antwoord.ts");
    // beide paden (stromend en als één tekst) geven het kleine budget mee
    expect(s.match(/, SITECHAT_SNEL_BUDGET\) : \{ systeem: bouwSysteem\(/g)).toHaveLength(2);
  });

  it("houdt bij echte vragen het systeemdeel onder het budget en het antwoord erin", async () => {
    const k = await smileyappKennis();
    const site = { bedrijf: k.bedrijf, omschrijving: k.omschrijving, ...(k.regels ? { regels: k.regels } : {}), medewerker: false };
    const gevallen: [string, RegExp][] = [
      ["Wat kost het Basis-pakket per maand?", /49,95/],
      ["Hoe werkt het swipen van de smiley?", /swipe/i],
      ["Voor welke branches is het geschikt?", /branche/i],
    ];
    for (const [vraag, moetErin] of gevallen) {
      const fragmenten = kiesFragmenten(vraag, k.fragmenten);
      const p = sitechatBinnenBudget(site, fragmenten, [{ rol: "gast" as const, tekst: vraag }], SITECHAT_SNEL_BUDGET);
      expect(schatTokens(p.systeem), vraag).toBeLessThanOrEqual(SITECHAT_SNEL_BUDGET);
      // het best passende fragment zit er nog in: het antwoord staat in de vraag aan het model
      expect(p.systeem, vraag).toMatch(moetErin);
      // en de vaste regels van de site zijn niet weggevallen
      expect(p.systeem.startsWith(bouwSysteem(site, []).slice(0, 200))).toBe(true);
      expect((p.systeem.match(/\n## /g) ?? []).length, vraag).toBeGreaterThanOrEqual(3);
    }
  });

  it("zegt tijdens het wachten wat er gebeurt, in plaats van alleen puntjes", () => {
    expect(lees("components/sitechat/SiteChat.tsx")).toContain("Ik zoek het even voor je op…");
  });
});
