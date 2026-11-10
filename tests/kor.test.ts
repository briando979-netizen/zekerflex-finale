import { describe, expect, it, vi } from "vitest";
import { euroNaarCent, korBinnenGrens, korIngang } from "@/lib/fiscal/kor";

// KOR-hulp (lib/fiscal/kor.ts): melding uiterlijk 4 weken vóór het kwartaal, omzet ≤ € 20.000.

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvListEntries: async () => [] }));

describe("korIngang", () => {
  it("het volgende kwartaal als er nog minstens 4 weken zijn", () => {
    expect(korIngang("2026-11-10")).toEqual({ ingang: "2027-01-01", uiterlijk: "2026-12-04" });
    expect(korIngang("2026-12-04")).toEqual({ ingang: "2027-01-01", uiterlijk: "2026-12-04" });
  });

  it("anders het kwartaal daarna", () => {
    expect(korIngang("2026-12-05")).toEqual({ ingang: "2027-04-01", uiterlijk: "2027-03-04" });
    expect(korIngang("2026-03-10")).toEqual({ ingang: "2026-07-01", uiterlijk: "2026-06-03" });
  });

  it("vroeg in een kwartaal: gewoon het volgende", () => {
    expect(korIngang("2026-01-02")).toEqual({ ingang: "2026-04-01", uiterlijk: "2026-03-04" });
  });
});

describe("bedragen en grens", () => {
  it("euro's als tekst of getal", () => {
    expect(euroNaarCent("12000")).toBe(1_200_000);
    expect(euroNaarCent("12.000")).toBe(1_200_000);
    expect(euroNaarCent("1234,56")).toBe(123_456);
    expect(euroNaarCent("€ 0")).toBe(0);
    expect(euroNaarCent(15000)).toBe(1_500_000);
    expect(euroNaarCent("abc")).toBeNull();
    expect(euroNaarCent("-5")).toBeNull();
    expect(euroNaarCent(null)).toBeNull();
  });

  it("dit jaar én vorig jaar hoogstens € 20.000", () => {
    expect(korBinnenGrens(2_000_000, 0)).toBe(true);
    expect(korBinnenGrens(2_000_001, 0)).toBe(false);
    expect(korBinnenGrens(1_000_000, 2_500_000)).toBe(false);
  });
});

describe("fiscale stap", () => {
  it("een ingediende KOR-melding telt voor een flexwerker als ingevuld; de KOR zelf nog niet", async () => {
    const { isComplete, invoiceModeFor, EMPTY_FISCAL } = await import("@/lib/fiscal/store");
    const f = {
      ...EMPTY_FISCAL,
      workerKind: "flexwerker" as const,
      iban: "NL00TEST0000000000",
      korAanvraag: { stand: "ingediend" as const, ingang: "2027-01-01", ingediendOp: "2026-11-10T10:00:00.000Z", omzetDitJaarCent: 1, omzetVorigJaarCent: 0 },
    };
    expect(isComplete(f)).toBe(true);
    expect(invoiceModeFor(f)).toBe("reverse-billing");
    expect(isComplete({ ...f, korAanvraag: null })).toBe(false);
  });
});

