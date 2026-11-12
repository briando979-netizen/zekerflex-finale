import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { LEVEL_KAART_NL, UITNODIGING_NL } from "@/lib/rewards/kaart-teksten";
import { CHAT_TEKSTEN } from "@/lib/chat/teksten-talen";
import { PUSH_KAART_NL } from "@/lib/account/teksten";

// Het kader van de level- en uitnodigingskaart in het werker-Account is vijftalig (level- en badgenamen en voordelen komen uit de server en
// blijven Nederlands), en de pushkaart in de chat-instellingen gebruikt dezelfde vertaling als het Account.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

describe("de teksten in vijf talen", () => {
  it("Nederlands is de standaard en gelijk aan wat er stond", () => {
    expect(FREELANCER_DICTS.nl.rewards).toEqual({ level: LEVEL_KAART_NL, uitnodiging: UITNODIGING_NL });
    expect(LEVEL_KAART_NL.jouwLevel).toBe("Jouw level");
    expect(LEVEL_KAART_NL.nogTot).toBe("Nog {n} XP tot {volgende}");
    expect(UITNODIGING_NL.knop).toBe("Deel je link");
  });

  it("elke taal heeft alle sleutels, dezelfde plaatshouders en een echte vertaling", () => {
    for (const taal of TALEN) {
      for (const sectie of ["level", "uitnodiging"] as const) {
        const nl = FREELANCER_DICTS.nl.rewards[sectie] as Record<string, string>;
        const v = FREELANCER_DICTS[taal].rewards[sectie] as Record<string, string>;
        expect(Object.keys(v).sort(), `${taal} ${sectie}`).toEqual(Object.keys(nl).sort());
        for (const [k, x] of Object.entries(nl)) {
          expect(v[k]!.length, `${taal} ${sectie}.${k}`).toBeGreaterThan(0);
          expect(plaats(v[k]!), `${taal} ${sectie}.${k}`).toBe(plaats(x));
          if (taal !== "nl" && x.length > 14 && k !== "locale") expect(v[k], `${taal} ${sectie}.${k}`).not.toBe(x);
        }
      }
      expect(FREELANCER_DICTS[taal].rewards.level.locale).toBe(FREELANCER_DICTS[taal].rewards.uitnodiging.locale);
    }
  });
});

describe("de kaarten", () => {
  const src = bron("components/rewards/RewardsCards.tsx");
  it("hebben een texts-prop met Nederlandse standaard en geen vaste kaderzinnen meer", () => {
    expect(src).toContain("texts = LEVEL_KAART_NL");
    expect(src).toContain("texts = UITNODIGING_NL");
    for (const zin of ["Jouw level", "Jouw voordelen", "Bekijk alle levels", "Verberg alle levels", "Deel je link", "Link gekopieerd", "Nodig iemand uit", "Werk en verdien via ZekerFlex"]) expect(src, zin).not.toContain(zin);
    // de werkgeverskaart (BusinessLevelCard) is niet aangeraakt: die blijft Nederlands
    expect(src).toContain("Partnerniveau");
  });

  it("alleen het werker-Account geeft de vertaling mee; de bank (werkgever) niet", () => {
    const acc = bron("app/dashboard/account/page.tsx");
    expect(acc).toContain("<LevelCard texts={ft.rewards.level} />");
    expect(acc).toContain("<ReferralCard texts={ft.rewards.uitnodiging} />");
    expect(bron("components/bank/BankView.tsx")).not.toContain("texts=");
  });

  it("de bankregels blijven: geen bank in de app of bij BANK_AAN uit", () => {
    expect(src).toContain("if (!data || inApp !== false || !BANK_AAN) return null;");
    expect(src).toContain("inApp || !BANK_AAN ? k.xpEinde : k.xpBank");
  });
});

describe("de pushkaart in de chat-instellingen", () => {
  it("krijgt dezelfde vertaling als het Account (alle vijf talen), via de chat-teksten", () => {
    expect(CHAT_TEKSTEN.nl.instellingen.pushKaart).toBe(PUSH_KAART_NL);
    for (const taal of ["en", "pl", "ro", "uk"] as const) expect(CHAT_TEKSTEN[taal].instellingen.pushKaart).toBe(FREELANCER_DICTS[taal].accountDelen.push);
    expect(bron("components/chat/ChatSettingsPanel.tsx")).toContain("<PushToggle cardTexts={t.pushKaart} />");
    expect(bron("components/chat/modals.tsx")).toContain("<PushToggle cardTexts={chat.instellingen.pushKaart} />");
  });
});
