import { describe, expect, it } from "vitest";
import { EERLIJK_REGELS, OUTREACH_STEP_SYSTEM, OUTREACH_SYSTEM, PRIJS_ZIN, ZEKERFLEX_PITCH } from "@/lib/sales/prompts";
import { BASE_FEE_PER_HOUR_CENTS, VOLUME_TIERS, tierRateCents } from "@/lib/pricing/tiers";

// De outreach-prompts beloven alleen wat nu echt kan (14 nov 2026): geen bank, voorschot of snelle uitbetaling, geen online
// betalen, geen verzonnen cijfers; de prijs komt uit lib/pricing/tiers.ts; één aanspreekvorm; Nederlands zonder Engelse woorden.

describe("outreach-prompts: alleen wat nu echt kan", () => {
  it("de pitch noemt de staffel uit tiers.ts en de juiste bedrijfsnaam", () => {
    expect(BASE_FEE_PER_HOUR_CENTS).toBe(350);
    expect(PRIJS_ZIN).toContain("€ 3,50 per gewerkt uur");
    expect(PRIJS_ZIN).toContain(`vanaf ${VOLUME_TIERS[1]!.fromHours} uur per maand € ${(tierRateCents(VOLUME_TIERS[1]!) / 100).toFixed(2).replace(".", ",")}`);
    expect(ZEKERFLEX_PITCH).toContain(PRIJS_ZIN);
    expect(ZEKERFLEX_PITCH).toContain("Zekerflex, Inc.");
    expect(ZEKERFLEX_PITCH).not.toMatch(/B\.V\./);
  });

  it("de pitch belooft geen SEPA-betaalopdracht, bank, voorschot of snelle uitbetaling meer, en geen uitzendopslag", () => {
    expect(ZEKERFLEX_PITCH).not.toContain("SEPA");
    expect(ZEKERFLEX_PITCH).not.toContain("gig-economy");
    expect(ZEKERFLEX_PITCH).not.toContain("skills");
    expect(ZEKERFLEX_PITCH).not.toMatch(/opslag/i);
    // de verboden onderwerpen staan er alleen als "niet beloven"
    const nietBeloven = ZEKERFLEX_PITCH.split("Niet beloven")[1] ?? "";
    for (const w of ["voorschot", "directe uitbetaling", "online betalen", "verzekering"]) expect(nietBeloven).toContain(w);
    expect(ZEKERFLEX_PITCH.split("Niet beloven")[0]).not.toMatch(/voorschot|uitbetaling|verzekering/);
  });

  it("elke prompt (los en de drie stappen) draagt de eerlijkheidsregels", () => {
    expect(EERLIJK_REGELS).toContain("Eén aanspreekvorm per mail");
    expect(EERLIJK_REGELS).toContain("noem geen bank, tegoed, voorschot, snelle of directe uitbetaling");
    expect(EERLIJK_REGELS).toContain("Verzin geen cijfers, klanten, reviews");
    expect(EERLIJK_REGELS).toContain('geen "skills", "gig-economy", "sparren"');
    expect(OUTREACH_SYSTEM).toContain(EERLIJK_REGELS);
    for (const stap of OUTREACH_STEP_SYSTEM) {
      expect(stap).toContain(EERLIJK_REGELS);
      expect(stap).toContain("Salesteam ZekerFlex");
      expect(stap).toContain("Zekerflex, Inc. als afzender");
    }
  });
});
