import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kaartBeeld, kolomVan, sorteer, toonVan, type BordBestelling } from "@/lib/horeca/bord";
import { archiefCsv, btwIn, leesArchiefFilter, MAX_DAGEN, omzetEnBtw, type ArchiefRij } from "@/lib/horeca/archief";
import { horecaTabs } from "@/lib/horeca/tabs";

// Het bestellingenbord, de bestellingenkaart en het archief van de horeca (15 nov 2026). Elke datum met een zone.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const nu = Date.parse("2026-11-15T18:30:00+01:00");
const b = (x: Partial<BordBestelling>): BordBestelling => ({
  soort: "tafel",
  status: "NIEUW",
  createdAt: "2026-11-15T18:25:00+01:00",
  gewenstOp: null,
  bevestigdOp: null,
  onderwegOp: null,
  afgeleverdOp: null,
  ...x,
});

describe("het bord", () => {
  it("kolommen: tijd bevestigen is nieuw, bevestigd is bezig, afgeleverd of geannuleerd is klaar", () => {
    expect(kolomVan(b({ soort: "bezorgen" }))).toBe("nieuw");
    expect(kolomVan(b({ soort: "bezorgen", bevestigdOp: "2026-11-15T19:00:00+01:00" }))).toBe("bezig");
    expect(kolomVan(b({ soort: "bezorgen", bevestigdOp: "x", onderwegOp: "y" }))).toBe("bezig");
    expect(kolomVan(b({ soort: "afhalen", bevestigdOp: "x", afgeleverdOp: "z", status: "GESERVEERD" }))).toBe("klaar");
    expect(kolomVan(b({ status: "NIEUW" }))).toBe("nieuw");
    expect(kolomVan(b({ status: "IN_BEREIDING" }))).toBe("bezig");
    expect(kolomVan(b({ status: "GESERVEERD" }))).toBe("klaar");
    expect(kolomVan(b({ soort: "bezorgen", status: "GEANNULEERD" }))).toBe("klaar");
  });

  it("kleur: wacht op jou, gepland, onderweg, te laat", () => {
    expect(toonVan(b({ soort: "bezorgen" }), nu)).toBe("wacht");
    expect(toonVan(b({ soort: "bezorgen", bevestigdOp: "2026-11-15T19:00:00+01:00" }), nu)).toBe("gepland");
    expect(toonVan(b({ soort: "bezorgen", bevestigdOp: "2026-11-15T19:00:00+01:00", onderwegOp: "x" }), nu)).toBe("onderweg");
    expect(toonVan(b({ soort: "bezorgen", bevestigdOp: "2026-11-15T18:20:00+01:00" }), nu)).toBe("laat");
    expect(toonVan(b({ status: "IN_BEREIDING", createdAt: "2026-11-15T18:00:00+01:00" }), nu)).toBe("laat");
    expect(toonVan(b({ status: "KLAAR", createdAt: "2026-11-15T18:00:00+01:00" }), nu)).toBe("gepland");
    expect(toonVan(b({ status: "GESERVEERD" }), nu)).toBe("af");
  });

  it("volgorde: eerst wat het eerst moet", () => {
    const lijst = [
      b({ soort: "bezorgen", bevestigdOp: "2026-11-15T19:30:00+01:00", createdAt: "2026-11-15T18:00:00+01:00" }),
      b({ soort: "bezorgen", bevestigdOp: "2026-11-15T18:45:00+01:00", createdAt: "2026-11-15T18:10:00+01:00" }),
      b({ createdAt: "2026-11-15T18:40:00+01:00" }),
    ];
    expect(sorteer(lijst).map((x) => x.bevestigdOp ?? x.createdAt)).toEqual(["2026-11-15T18:40:00+01:00", "2026-11-15T18:45:00+01:00", "2026-11-15T19:30:00+01:00"]);
  });
});

describe("de bestellingenkaart", () => {
  it("één punt: zo ver mogelijk ingezoomd en precies in het midden", () => {
    const k = kaartBeeld([{ lat: 52.3731, lng: 4.8926 }], 600, 400);
    expect(k?.zoom).toBe(16);
    expect(k?.punten[0]).toEqual({ x: 300, y: 200 });
    // de tegels dekken het hele beeld
    expect(Math.min(...(k?.tegels ?? []).map((t) => t.links))).toBeLessThanOrEqual(0);
    expect(Math.max(...(k?.tegels ?? []).map((t) => t.links + 256))).toBeGreaterThanOrEqual(600);
  });

  it("verder uit elkaar: uitzoomen tot alles past, met marge", () => {
    const k = kaartBeeld([{ lat: 52.3731, lng: 4.8926 }, { lat: 52.3567, lng: 4.9541 }], 600, 400);
    expect(k).not.toBeNull();
    expect(k!.zoom).toBeLessThan(16);
    for (const p of k!.punten) {
      expect(p.x).toBeGreaterThanOrEqual(32);
      expect(p.x).toBeLessThanOrEqual(600 - 32);
      expect(p.y).toBeGreaterThanOrEqual(32);
      expect(p.y).toBeLessThanOrEqual(400 - 32);
    }
  });

  it("geen punten of geen breedte: geen kaart", () => {
    expect(kaartBeeld([], 600, 400)).toBeNull();
    expect(kaartBeeld([{ lat: 52, lng: 5 }], 0, 400)).toBeNull();
  });
});

describe("het archief", () => {
  const q = (s: string) => leesArchiefFilter(new URLSearchParams(s));

  it("filter: periode verplicht en hooguit drie maanden; onbekende waarden vallen weg", () => {
    expect(q("van=2026-11-20&tot=2026-11-10")).toEqual({ fout: "Kies een periode." });
    expect(q("van=2026-01-01&tot=2026-12-31")).toEqual({ fout: `Kies een periode van hooguit ${MAX_DAGEN} dagen.` });
    const f = q("van=2026-11-09&tot=2026-11-15&soort=bezorgen,onzin&bron=online&betaald=nee&geannuleerd=1&bezorger=b1&q=%20Dam%20");
    expect(f).toEqual({ van: "2026-11-09", tot: "2026-11-15", soorten: ["bezorgen"], bronnen: ["online"], betaald: "nee", geannuleerd: true, bezorgerId: "b1", zoek: "Dam" });
    const leeg = q("van=2026-11-15&tot=2026-11-15");
    expect("fout" in leeg ? null : leeg.soorten).toEqual(["tafel", "afhalen", "bezorgen"]);
  });

  const rij = (x: Partial<ArchiefRij>): ArchiefRij => ({
    id: "a",
    nummer: 1,
    createdAt: "2026-11-15T18:00:00+01:00",
    soort: "tafel",
    bron: "bediening",
    status: "GESERVEERD",
    naam: "",
    tafelNaam: "Tafel 4",
    adres: "",
    postcode: "",
    plaats: "",
    telefoon: "",
    totaalCent: 0,
    kortingCent: 0,
    bezorgkostenCent: 0,
    betaald: true,
    betaalwijze: "pin",
    bezorgerId: null,
    regels: [],
    ...x,
  });

  it("omzet en btw: per tarief, bezorgkosten op het tarief van de maaltijd, geannuleerd telt niet", () => {
    const s = omzetEnBtw([
      rij({ totaalCent: 2180, regels: [{ btw: 9, prijsCent: 1090, aantal: 2 }] }),
      rij({ soort: "bezorgen", totaalCent: 1500, bezorgkostenCent: 250, regels: [{ btw: 9, prijsCent: 900, aantal: 1 }, { btw: 21, prijsCent: 300, aantal: 2 }] }),
      rij({ status: "GEANNULEERD", totaalCent: 9999, regels: [{ btw: 21, prijsCent: 9999, aantal: 1 }] }),
    ]);
    expect(s.aantal).toBe(2);
    expect(s.omzetCent).toBe(2180 + 1750);
    expect(s.bezorgkostenCent).toBe(250);
    expect(s.perTarief).toEqual([
      { btw: 21, omzetCent: 600, btwCent: btwIn(600, 21) },
      { btw: 9, omzetCent: 2180 + 900 + 250, btwCent: btwIn(3330, 9) },
    ]);
    expect(btwIn(1090, 9)).toBe(90);
    expect(btwIn(121, 21)).toBe(21);
  });

  it("CSV: Nederlandse bedragen, geen telefoonnummer, met BOM", () => {
    const csv = archiefCsv([rij({ soort: "bezorgen", naam: "Test Klant", adres: "Dam 1", postcode: "1012 JS", plaats: "Amsterdam", telefoon: "0612345678", totaalCent: 1500, bezorgkostenCent: 250 })], () => ({ datum: "2026-11-15", tijd: "18:00" }));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"17,50"');
    expect(csv).not.toContain("0612345678");
  });
});

describe("aansluiting", () => {
  it("tabblad Archief bij bestellen, met een icoon in het menu", () => {
    expect(horecaTabs(["bestellen"]).some((t) => t.id === "archief")).toBe(true);
    expect(horecaTabs([]).some((t) => t.id === "archief")).toBe(false);
    expect(lees("app/werkgever/layout.tsx")).toMatch(/archief: <IBriefcase \/>/);
  });

  it("de kaart gebruikt alleen onze eigen tegels", () => {
    const kaart = lees("components/horeca/beheer/BestelKaart.tsx");
    expect(kaart).toContain("/api/kaart/straat/");
    expect(kaart).not.toMatch(/https?:\/\//);
  });
});
