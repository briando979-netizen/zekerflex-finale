import { describe, expect, it } from "vitest";
import {
  afzenderFout,
  bedragTekst,
  btwUitTotaal,
  centenInvoer,
  centenUitInvoer,
  dagenTot,
  dagTekst,
  schoonAfzender,
  zekerheidTekst,
} from "@/lib/boekhouding/scherm-kern";

describe("bedragen", () => {
  it("toont euro's in gewoon Nederlands", () => {
    expect(bedragTekst(123456)).toBe("€ 1.234,56");
    expect(bedragTekst(5)).toBe("€ 0,05");
    expect(bedragTekst(null)).toBe("onbekend");
    expect(bedragTekst(1000, "USD")).toBe("10,00 USD");
  });

  it("leest wat een mens intikt", () => {
    expect(centenUitInvoer("12,50")).toBe(1250);
    expect(centenUitInvoer("1.234,56")).toBe(123456);
    expect(centenUitInvoer("12.5")).toBe(1250);
    expect(centenUitInvoer("€ 12")).toBe(1200);
    expect(centenUitInvoer("1.234")).toBe(123400);
    expect(centenUitInvoer("abc")).toBeNull();
    expect(centenUitInvoer("")).toBeNull();
    expect(centenUitInvoer("-5")).toBeNull();
  });

  it("zet centen terug in een invulveld", () => {
    expect(centenInvoer(1250)).toBe("12,50");
    expect(centenInvoer(null)).toBe("");
  });

  it("rekent de btw uit een totaal inclusief btw", () => {
    expect(btwUitTotaal(12100, 21)).toBe(2100);
    expect(btwUitTotaal(10900, 9)).toBe(900);
    expect(btwUitTotaal(5000, 0)).toBe(0);
  });
});

describe("datums", () => {
  it("toont een dagsleutel als gewone datum", () => {
    expect(dagTekst("2026-04-10")).toBe("10 april 2026");
    expect(dagTekst(null)).toBe("onbekend");
    expect(dagTekst("rare tekst")).toBe("rare tekst");
  });

  it("telt dagen in Amsterdamse dagen", () => {
    const nu = new Date("2026-11-12T10:00:00+01:00");
    expect(dagenTot(new Date("2026-11-12T23:59:59+01:00"), nu)).toBe(0);
    expect(dagenTot(new Date("2026-11-30T23:59:59+01:00"), nu)).toBe(18);
    expect(dagenTot(new Date("2026-11-10T12:00:00+01:00"), nu)).toBe(-2);
    // 23:30 UTC op 12 nov is al 13 nov in Amsterdam
    expect(dagenTot(new Date("2026-11-13T12:00:00+01:00"), new Date("2026-11-12T23:30:00Z"))).toBe(0);
  });
});

describe("zekerheid en afzenders", () => {
  it("zegt in woorden hoe zeker het uitlezen was", () => {
    expect(zekerheidTekst(900)).toBe("Vrij zeker (90%)");
    expect(zekerheidTekst(700)).toBe("Matig zeker (70%)");
    expect(zekerheidTekst(300)).toBe("Onzeker (30%)");
    expect(zekerheidTekst(null)).toBe("Zekerheid onbekend");
  });

  it("keurt een afzender af die geen adres of domein is", () => {
    expect(afzenderFout("factuur@hetzner.com")).toBeNull();
    expect(afzenderFout("@hetzner.com")).toBeNull();
    expect(afzenderFout("  Factuur@Hetzner.com ")).toBeNull();
    expect(afzenderFout("")).not.toBeNull();
    expect(afzenderFout("hetzner.com")).not.toBeNull();
    expect(afzenderFout("a b@c.nl")).not.toBeNull();
    expect(schoonAfzender("  Factuur@Hetzner.com ")).toBe("factuur@hetzner.com");
  });
});
