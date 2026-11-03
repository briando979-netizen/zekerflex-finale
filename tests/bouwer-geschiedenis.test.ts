import { describe, expect, it } from "vitest";
import { dagoverzichtTekst, leesbaar } from "@/lib/bouwer/geschiedenis";

describe("wat er live ging, in gewone taal", () => {
  it("zet conventionele commits om", () => {
    expect(leesbaar("feat(shop): filter op maat")).toEqual({ soort: "nieuw", tekst: "Filter op maat" });
    expect(leesbaar("fix(voorstel): inloggen werkte niet")).toEqual({ soort: "opgelost", tekst: "Inloggen werkte niet" });
    expect(leesbaar("perf(build): lettertypes zelf gehost")).toEqual({ soort: "sneller", tekst: "Lettertypes zelf gehost" });
    expect(leesbaar("chore(beheer): opruimen").soort).toBe("achter");
    expect(leesbaar("refactor(live): één script").soort).toBe("achter");
    expect(leesbaar("Gewone zin zonder type").soort).toBe("nieuw");
  });

  it("maakt een mail met kopjes, en telt kleine wijzigingen apart", () => {
    const mail = dagoverzichtTekst(
      ["feat(rekentools): Wet DBA-check voor zzp", "fix(telephony): weigeringen in gewoon Nederlands", "chore(beheer): taak", "test: meer tests"],
      { sha: "f6bf84b9da4629ab0dd79ba6bf29f3fb2a19c922", datum: "", onderwerp: "fix(telephony): weigeringen in gewoon Nederlands" },
      "https://zekerflex.com",
    );
    expect(mail?.onderwerp).toBe("ZekerFlex: vandaag live gezet (4 wijzigingen)");
    expect(mail?.tekst).toContain("Nieuw\n• Wet DBA-check voor zzp");
    expect(mail?.tekst).toContain("Opgelost\n• Weigeringen in gewoon Nederlands");
    expect(mail?.tekst).toContain("En 2 kleinere wijzigingen achter de schermen.");
    expect(mail?.tekst).toContain("https://zekerflex.com/admin/zekerflex-ai");
  });

  it("blijft leesbaar op een drukke dag (max 25 per kopje)", () => {
    const veel = Array.from({ length: 40 }, (_, i) => `feat(x): onderdeel ${i + 1}`);
    const mail = dagoverzichtTekst(veel, null, "https://zekerflex.com");
    expect(mail?.tekst).toContain("• Onderdeel 25\n… en nog 15 meer");
    expect(mail?.tekst).not.toContain("Onderdeel 26");
  });

  it("geen wijzigingen = geen mail", () => {
    expect(dagoverzichtTekst([], null, "https://zekerflex.com")).toBeNull();
  });
});
