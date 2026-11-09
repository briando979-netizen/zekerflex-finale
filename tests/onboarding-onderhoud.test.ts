import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvDelete: async () => undefined }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { FLAG_REGISTRY } = await import("@/lib/flags");
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

describe("melding: we verbeteren de aanmelding", () => {
  it("staat als flag klaar en staat standaard aan, zodat de eigenaar hem zonder uitrol kan uitzetten", () => {
    const flag = FLAG_REGISTRY.find((f) => f.key === "onboarding-onderhoud");
    expect(flag?.default).toBe(true);
    expect(flag?.description).toMatch(/Zet uit/);
  });

  it("heeft een titel en tekst in alle vijf de talen van de werker-app", () => {
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const t = FREELANCER_DICTS[taal].onderhoud;
      expect(t.titel.length, taal).toBeGreaterThan(5);
      expect(t.tekst.length, taal).toBeGreaterThan(200);
    }
  });

  it("de Nederlandse tekst zegt wat de eigenaar wilde: wachten, bericht, testklussen, online begin volgend jaar", () => {
    const tekst = FREELANCER_DICTS.nl.onderhoud.tekst;
    expect(tekst).toMatch(/haperen/);
    expect(tekst).toMatch(/Wacht dan even/);
    expect(tekst).toMatch(/krijgt een bericht/);
    expect(tekst).toMatch(/testklussen/);
    expect(tekst).toMatch(/Begin volgend jaar/);
  });
});
