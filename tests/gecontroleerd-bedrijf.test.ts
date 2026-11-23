import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BEDRIJF_NOG_NIET_GECONTROLEERD,
  CONTROLE_MELDING_TEKST,
  MAX_BEWAARDE_KEUZES,
  NOG_NIET_GECONTROLEERD_TEKST,
  bedrijfMagDoen,
  controleStand,
  controleerControleInvoer,
  isTelefoon,
  maakAanvraag,
  maakControleInvoer,
  openKeuzes,
  voegKeuzesSamen,
  type BedrijfActie,
  type ControleInvoer,
} from "@/lib/company/gecontroleerd";

// De beslissing "mag dit bedrijf plaatsen / reacties zien / inplannen" en de veldcontrole van "Nog een paar laatste checks"
// (23 nov 2026, eigenaar: de controle komt pas bij het inplannen, zoals bij YoungOnes). Puur: geen prisma, kv of zod.

const GOED: ControleInvoer = {
  land: "NL",
  kvkNumber: "12345678",
  btwNummer: "",
  registratieNummer: "",
  bedrijfsnaam: "Bakkerij Jansen B.V.",
  contactNaam: "Sanne Jansen",
  contactFunctie: "Eigenaar",
  telefoon: "+31 6 12345678",
  tekentZelf: true,
  tekenaarNaam: "",
};

describe("bedrijfMagDoen: plaatsen en reacties zien zijn vrij, inplannen niet", () => {
  const ALLES: BedrijfActie[] = ["plaatsen", "reacties-zien", "inplannen", "uitbetalen", "overeenkomst-tekenen"];

  it("een bedrijf dat nog niet is gecontroleerd: alleen plaatsen en reacties zien", () => {
    expect(ALLES.filter((a) => bedrijfMagDoen(false, a))).toEqual(["plaatsen", "reacties-zien"]);
  });

  it("een gecontroleerd bedrijf mag alles", () => {
    expect(ALLES.filter((a) => bedrijfMagDoen(true, a))).toEqual(ALLES);
  });

  it("de code en de teksten: eigen code, gewoon Nederlands, geen woord test en geen belofte over snelheid", () => {
    expect(BEDRIJF_NOG_NIET_GECONTROLEERD).toBe("BEDRIJF_NOG_NIET_GECONTROLEERD");
    for (const t of [NOG_NIET_GECONTROLEERD_TEKST, CONTROLE_MELDING_TEKST]) {
      expect(t).not.toMatch(/test|proef/i);
      expect(t).not.toMatch(/binnen (een|1|één) werkdag|\d+ (uur|minuten)/i);
    }
    expect(NOG_NIET_GECONTROLEERD_TEKST).toContain("Je klus staat live");
  });
});

describe("controleerControleInvoer", () => {
  it("een complete invoer is goed", () => {
    expect(controleerControleInvoer(GOED)).toEqual({ ok: true });
  });

  it("Nederland: het KVK-nummer is 8 cijfers", () => {
    expect(controleerControleInvoer({ ...GOED, kvkNumber: "" })).toMatchObject({ ok: false, fouten: { kvkNumber: "leeg" } });
    expect(controleerControleInvoer({ ...GOED, kvkNumber: "1234" })).toMatchObject({ ok: false, fouten: { kvkNumber: "ongeldig" } });
    expect(controleerControleInvoer({ ...GOED, kvkNumber: "1234 5678" })).toEqual({ ok: true });
  });

  it("een EU-land vraagt een btw-nummer en een land daarbuiten een registratienummer, geen KVK", () => {
    const de = { ...GOED, land: "DE", kvkNumber: "" };
    expect(controleerControleInvoer(de)).toMatchObject({ ok: false, fouten: { btwNummer: "leeg" } });
    expect(controleerControleInvoer({ ...de, btwNummer: "DE123456789" })).toEqual({ ok: true });
    const us = { ...GOED, land: "US", kvkNumber: "" };
    expect(controleerControleInvoer(us)).toMatchObject({ ok: false, fouten: { registratieNummer: "leeg" } });
    expect(controleerControleInvoer({ ...us, registratieNummer: "DE-7654321" })).toEqual({ ok: true });
  });

  it("een onbekend land is ongeldig", () => {
    expect(controleerControleInvoer({ ...GOED, land: "XX" })).toMatchObject({ ok: false, fouten: { land: "ongeldig" } });
  });

  it("bedrijfsnaam, contactpersoon, functie en telefoon zijn verplicht", () => {
    const r = controleerControleInvoer({ ...GOED, bedrijfsnaam: "", contactNaam: "", contactFunctie: "", telefoon: "" });
    expect(r).toMatchObject({ ok: false, fouten: { bedrijfsnaam: "leeg", contactNaam: "leeg", contactFunctie: "leeg", telefoon: "leeg" } });
  });

  it("wie tekent: de contactpersoon zelf, of een naam van iemand anders", () => {
    expect(controleerControleInvoer({ ...GOED, tekentZelf: false, tekenaarNaam: "" })).toMatchObject({ ok: false, fouten: { tekenaarNaam: "leeg" } });
    expect(controleerControleInvoer({ ...GOED, tekentZelf: false, tekenaarNaam: "Piet de Vries" })).toEqual({ ok: true });
    // tekent hij zelf, dan telt een achtergebleven naam niet mee
    expect(controleerControleInvoer({ ...GOED, tekentZelf: true, tekenaarNaam: "" })).toEqual({ ok: true });
  });

  it("een telefoonnummer: 8 tot 15 cijfers, met +, spaties en streepjes toegestaan, geen letters", () => {
    for (const goed of ["0612345678", "+31 6 12345678", "010-1234567", "(010) 123 45 67"]) expect(isTelefoon(goed), goed).toBe(true);
    for (const fout of ["12345", "bel mij maar", "06123abc78", "1234567890123456"]) expect(isTelefoon(fout), fout).toBe(false);
  });
});

describe("maakControleInvoer en maakAanvraag", () => {
  it("maakt van ruwe invoer nette tekst: afgekapt, getrimd, en het land in hoofdletters", () => {
    const i = maakControleInvoer({ land: "de ", kvkNumber: 12345678, bedrijfsnaam: `  ${"x".repeat(200)}  `, tekentZelf: "on" });
    expect(i.land).toBe("DE");
    expect(i.kvkNumber).toBe("");
    expect(i.bedrijfsnaam).toHaveLength(120);
    expect(i.tekentZelf).toBe(true);
    expect(maakControleInvoer({}).tekentZelf).toBe(false);
  });

  it("bewaart alleen het nummer dat bij het land hoort, en de tekenaar alleen als het iemand anders is", () => {
    const nl = maakAanvraag({ ...GOED, kvkNumber: "1234 5678", btwNummer: "NL1", registratieNummer: "x" }, [], new Date("2026-11-23T10:00:00+01:00"));
    expect(nl).toMatchObject({ land: "NL", kvkNumber: "12345678", btwNummer: null, registratieNummer: null, tekenaarNaam: null, keuzes: [], gemeldOp: null });
    expect(nl.op).toBe("2026-11-23T09:00:00.000Z");
    const de = maakAanvraag({ ...GOED, land: "DE", btwNummer: "de 123 456 789", tekentZelf: false, tekenaarNaam: "Piet" }, [], new Date());
    expect(de).toMatchObject({ land: "DE", kvkNumber: null, btwNummer: "DE123456789", registratieNummer: null, tekenaarNaam: "Piet" });
    const us = maakAanvraag({ ...GOED, land: "US", registratieNummer: "DE-7654321" }, [], new Date());
    expect(us).toMatchObject({ kvkNumber: null, btwNummer: null, registratieNummer: "DE-7654321" });
  });
});

describe("de bewaarde keuzes", () => {
  const k = (n: number) => ({ offerId: `o${n}`, shiftId: `s${n}` });

  it("voegt samen zonder dubbelen en houdt de volgorde (de nieuwste achteraan)", () => {
    expect(voegKeuzesSamen([k(1), k(2)], [k(2), k(3)])).toEqual([k(1), k(2), k(3)]);
    expect(voegKeuzesSamen([], [{ offerId: "", shiftId: "s" }, { offerId: "o", shiftId: "" }])).toEqual([]);
  });

  it(`bewaart hoogstens ${MAX_BEWAARDE_KEUZES}: de oudste vallen af`, () => {
    const veel = Array.from({ length: MAX_BEWAARDE_KEUZES + 5 }, (_, i) => k(i));
    const uit = voegKeuzesSamen([], veel);
    expect(uit).toHaveLength(MAX_BEWAARDE_KEUZES);
    expect(uit[0]).toEqual(k(5));
  });

  it("een nieuwe aanvraag houdt de keuzes van de vorige", () => {
    const eerste = maakAanvraag(GOED, [k(1)], new Date());
    expect(maakAanvraag(GOED, [k(2)], new Date(), eerste).keuzes).toEqual([k(1), k(2)]);
  });

  it("openKeuzes: alleen wat nog bij een open reactie hoort", () => {
    const a = maakAanvraag(GOED, [k(1), k(2), k(3)], new Date());
    expect(openKeuzes(a, new Set(["o1", "o3"]))).toEqual(["o1", "o3"]);
    expect(openKeuzes(null, new Set(["o1"]))).toEqual([]);
  });
});

// Waar de poort staat: plaatsen is vrij (geen limiet, geen controle), elke weg waarlangs iemand echt wordt ingepland of uitgenodigd
// voor een plek is op de server dicht tot het bedrijf is gecontroleerd. Een bronbewaker: een nieuwe inplan-weg zonder poort valt hier op.
describe("de poort in de code", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

  it("plaatsen heeft geen poort meer: geen limiet van één klus in de klusmaker, de publieke API of de zichtbaarheid voor werkers", () => {
    for (const f of ["lib/shifts/create.ts", "app/api/public/v1/shifts/route.ts", "lib/dashboard/marketplace.ts"]) {
      expect(lees(f), f).not.toMatch(/assertMayPlaceShift|eisBedrijfGecontroleerd|isTenantVerified/);
    }
    expect(lees("lib/company/verified.ts")).not.toContain("export async function assertMayPlaceShift");
  });

  it("de wegen waarlangs iemand wordt ingepland of uitgenodigd weigeren een bedrijf dat nog niet is gecontroleerd", () => {
    for (const f of ["app/api/werkgever/planner/verstuur/route.ts", "app/api/werkgever/spoed/route.ts"]) expect(lees(f), f).toContain("await eisBedrijfGecontroleerd(");
    expect(lees("app/werkgever/diensten/[shiftId]/actions.ts")).toContain('bedrijfMagDoen(await isTenantVerified(shift.branch.tenantId), "inplannen")');
    // de ShiftAssignment-wegen die niet via de werkgever lopen: de werker neemt aan, automatisch inplannen en herstellen
    for (const f of ["lib/notifications/dispatcher.ts", "lib/matching/apply.ts", "lib/matching/engine.ts", "lib/matching/heal.ts"]) {
      expect(lees(f), f).toContain("isTenantVerified(shift.branch.tenantId)");
    }
  });
});

describe("controleStand", () => {
  it("open, aangevraagd of gecontroleerd", () => {
    const a = maakAanvraag(GOED, [], new Date());
    expect(controleStand({ gecontroleerd: false, aanvraag: null })).toBe("open");
    expect(controleStand({ gecontroleerd: false, aanvraag: a })).toBe("aangevraagd");
    expect(controleStand({ gecontroleerd: true, aanvraag: a })).toBe("gecontroleerd");
    expect(controleStand({ gecontroleerd: true, aanvraag: undefined })).toBe("gecontroleerd");
  });
});
