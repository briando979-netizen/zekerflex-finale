import { describe, expect, it } from "vitest";
import { LEEG, anderenPerAccount, niveau, redenen, risicoScore } from "@/lib/fraud/account-regels";

// Pure regels van ZekerFlex FraudShield: de score per account en het delen van gegevens tussen accounts.

describe("risicoScore", () => {
  it("geen signaal is 0 en laag", () => {
    expect(risicoScore(LEEG)).toBe(0);
    expect(niveau(0)).toBe("laag");
    expect(redenen(LEEG)).toEqual([]);
  });

  it("hetzelfde identiteitsbewijs en rekeningnummer samen is hoog", () => {
    const s = { ...LEEG, dubbelDocument: 1, gedeeldIban: 2 };
    expect(risicoScore(s)).toBe(70);
    expect(niveau(risicoScore(s))).toBe("hoog");
    // zwaarste reden eerst
    expect(redenen(s).map((r) => r.code)).toEqual(["dubbel-document", "gedeeld-iban"]);
  });

  it("een gedeeld toestel weegt zwaarder vanaf drie andere accounts", () => {
    expect(risicoScore({ ...LEEG, gedeeldApparaat: 1 })).toBe(15);
    expect(risicoScore({ ...LEEG, gedeeldApparaat: 3 })).toBe(25);
  });

  it("collusie telt pas vanaf score 50, voor een kwart", () => {
    expect(risicoScore({ ...LEEG, collusie: 49 })).toBe(0);
    expect(risicoScore({ ...LEEG, collusie: 80 })).toBe(20);
  });

  it("de score komt nooit boven de 100", () => {
    const alles = { gedeeldApparaat: 5, dubbelDocument: 2, gedeeldIban: 2, ibanWachtOpControle: true, geblokkeerd: true, collusie: 100 };
    expect(risicoScore(alles)).toBe(100);
  });

  it("alleen een gewijzigd rekeningnummer is een laag signaal", () => {
    const s = { ...LEEG, ibanWachtOpControle: true };
    expect(risicoScore(s)).toBe(10);
    expect(niveau(10)).toBe("laag");
    expect(niveau(30)).toBe("verhoogd");
  });
});

describe("anderenPerAccount", () => {
  it("telt per account hoeveel anderen hetzelfde delen", () => {
    const uit = anderenPerAccount([["a", "b", "c"], ["d"], ["e", "e"]]);
    expect(uit.get("a")).toBe(2);
    expect(uit.get("c")).toBe(2);
    // een groep van één (ook met een dubbele vermelding van hetzelfde account) telt niet
    expect(uit.has("d")).toBe(false);
    expect(uit.has("e")).toBe(false);
  });

  it("neemt de grootste groep als een account in meer groepen zit", () => {
    const uit = anderenPerAccount([["a", "b"], ["a", "c", "d", "e"]]);
    expect(uit.get("a")).toBe(3);
    expect(uit.get("b")).toBe(1);
  });
});
