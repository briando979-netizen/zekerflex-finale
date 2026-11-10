import { describe, expect, it } from "vitest";
import {
  HARDWARE,
  PAKKETTEN,
  STANDAARD_INSTELLINGEN,
  exclCent,
  inkoopBereik,
  inkoopVoorRekenen,
  maakInstellingen,
  margeVanVerkoop,
  pakketTotaal,
  verkoopCentVan,
  voorstelCent,
} from "@/lib/hardware/catalogus";

describe("hardware-catalogus", () => {
  it("heeft unieke id's en alleen https-bronnen", () => {
    const ids = HARDWARE.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of HARDWARE) for (const w of i.waarnemingen) expect(w.bron.url, i.id).toMatch(/^https:\/\//);
  });

  it("rekent een prijs inclusief btw terug naar exclusief, en laat 'onbekend' als exclusief staan", () => {
    const bron = { label: "x", url: "https://x.nl" };
    expect(exclCent({ cent: 14650, btw: "incl", bron })).toBe(12107);
    expect(exclCent({ cent: 12107, btw: "excl", bron })).toBe(12107);
    expect(exclCent({ cent: 12107, btw: "onbekend", bron })).toBe(12107);
  });

  it("geeft het laagste en hoogste inkoopbedrag, en null zonder prijs", () => {
    const printer = HARDWARE.find((i) => i.id === "bonprinter-usb");
    expect(printer && inkoopBereik(printer)).toEqual({ vanCent: 12107, totCent: 12107 });
    const kassa = HARDWARE.find((i) => i.id === "kassa-156");
    expect(kassa && inkoopBereik(kassa)).toEqual({ vanCent: 42900, totCent: 49900 });
    const qr = HARDWARE.find((i) => i.id === "qr-tafelstandaard");
    expect(qr && inkoopBereik(qr)).toBeNull();
    // gerekend wordt met de hoogste inkoop: voorzichtig
    expect(kassa && inkoopVoorRekenen(kassa)).toBe(49900);
  });

  it("maakt een voorstel van inkoop plus marge, naar boven afgerond op vijf euro", () => {
    expect(voorstelCent(49900, 30)).toBe(65000);
    expect(voorstelCent(12107, 30)).toBe(16000);
    expect(voorstelCent(10000, 0)).toBe(10000);
    expect(voorstelCent(10000, -50)).toBe(10000);
  });

  it("berekent de marge als deel van de verkoopprijs", () => {
    expect(margeVanVerkoop(65000, 49900)).toBe(23.2);
    expect(margeVanVerkoop(0, 100)).toBeNull();
  });

  it("neemt een eigen prijs boven het voorstel, en geeft null als er geen inkoop en geen eigen prijs is", () => {
    const kassa = HARDWARE.find((i) => i.id === "kassa-156")!;
    const qr = HARDWARE.find((i) => i.id === "qr-tafelstandaard")!;
    expect(verkoopCentVan(kassa, STANDAARD_INSTELLINGEN)).toBe(65000);
    expect(verkoopCentVan(kassa, { ...STANDAARD_INSTELLINGEN, verkoopCent: { "kassa-156": 59900 } })).toBe(59900);
    expect(verkoopCentVan(qr, STANDAARD_INSTELLINGEN)).toBeNull();
    expect(verkoopCentVan(qr, { ...STANDAARD_INSTELLINGEN, verkoopCent: { "qr-tafelstandaard": 450 } })).toBe(450);
  });

  it("verwijst in elk pakket alleen naar bestaande apparaten", () => {
    for (const p of PAKKETTEN) for (const r of p.regels) expect(HARDWARE.some((i) => i.id === r.item), `${p.id}: ${r.item}`).toBe(true);
  });

  it("telt een pakket op en meldt apparaten zonder prijs, zonder ze mee te tellen", () => {
    const start = PAKKETTEN.find((p) => p.id === "start")!;
    const t = pakketTotaal(start, STANDAARD_INSTELLINGEN);
    expect(t.zonderPrijs).toEqual([]);
    expect(t.verkoopCent).toBeGreaterThan(t.inkoopCent);
    const compleet = PAKKETTEN.find((p) => p.id === "compleet")!;
    expect(pakketTotaal(compleet, STANDAARD_INSTELLINGEN).zonderPrijs).toContain("QR-tafelstandaard met ZekerFlex-logo");
    // met een eigen prijs voor de standaard telt hij mee
    const met = pakketTotaal(compleet, { ...STANDAARD_INSTELLINGEN, verkoopCent: { "qr-tafelstandaard": 500 } });
    expect(met.zonderPrijs).toEqual([]);
  });
});

describe("maakInstellingen", () => {
  it("valt terug op de standaard bij rommel", () => {
    expect(maakInstellingen(null)).toEqual(STANDAARD_INSTELLINGEN);
    expect(maakInstellingen("x")).toEqual(STANDAARD_INSTELLINGEN);
  });

  it("laat onbekende apparaten en rare getallen vallen en begrenst de marge", () => {
    const r = maakInstellingen({
      margePct: 5000,
      verkoopCent: { "kassa-156": 59900, bestaatniet: 100, "bonprinter-usb": -5, "scanner-2d": "veel" },
      uit: ["scanner-2d", "bestaatniet", 7],
      installatieCent: 14900.4,
    });
    expect(r.margePct).toBe(300);
    expect(r.verkoopCent).toEqual({ "kassa-156": 59900 });
    expect(r.uit).toEqual(["scanner-2d"]);
    expect(r.installatieCent).toBe(14900);
  });
});
