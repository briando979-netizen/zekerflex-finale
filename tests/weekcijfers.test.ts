import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { perWeek, richting, WEEK_RIJEN, weekCijfers, weken } from "@/lib/admin/weekcijfers-kern";
import { isEchtBedrijf, isEchteAanmelding } from "@/lib/admin/echt-kern";
import { LEGE_EIGEN_TEST } from "@/lib/admin/eigen-test-kern";

// De week in vijf getallen en wat als echt telt (15 nov 2026, lib/admin/weekcijfers-kern.ts, lib/admin/echt-kern.ts).

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
// zondag 15 nov 2026, 10:00 Nederlandse tijd (de klok staat vast: geen tijdbom)
const NU = new Date("2026-11-15T10:00:00+01:00");

describe("de weken", () => {
  it("acht weken van maandag tot maandag, oudste eerst, de laatste is de lopende", () => {
    const w = weken(NU);
    expect(w).toHaveLength(8);
    expect(w.map((x) => x.key)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(w[7]).toMatchObject({ label: "9 nov", lopend: true });
    expect(w.filter((x) => x.lopend)).toHaveLength(1);
    // maandag 00:00 in Nederland, ook over de overgang naar wintertijd (25 okt) heen
    expect(w[7]?.van.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(w[4]?.van.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(w[5]?.van.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(w[4]?.tot.getTime()).toBe(w[5]?.van.getTime());
  });

  it("op maandagochtend vroeg is de nieuwe week al begonnen", () => {
    const w = weken(new Date("2026-11-16T00:30:00+01:00"));
    expect(w[7]?.key).toBe("2026-11-16");
  });

  it("telt per week en laat wat ervoor of erna valt weg", () => {
    const w = weken(NU);
    const rijen = [
      { at: new Date("2026-11-09T08:00:00+01:00"), n: 2 },
      { at: new Date("2026-11-15T23:59:00+01:00"), n: 3 },
      { at: new Date("2026-11-08T23:59:00+01:00"), n: 5 },
      { at: new Date("2026-01-01T12:00:00+01:00"), n: 7 },
      { at: null, n: 11 },
    ];
    expect(perWeek(w, rijen, (r) => r.at)).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
    expect(perWeek(w, rijen, (r) => r.at, (r) => r.n)).toEqual([0, 0, 0, 0, 0, 0, 5, 5]);
  });

  it("de vijf rijen in vaste volgorde, ontbrekend telt als 0", () => {
    const c = weekCijfers(weken(NU), { bezoekers: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(c.rijen.map((r) => r.sleutel)).toEqual(["bezoekers", "aanmeldingen", "klussen", "uren", "betaald"]);
    expect(c.rijen[0]?.waarden).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(c.rijen[4]?.waarden).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(WEEK_RIJEN.every((r) => r.uitleg.length > 0)).toBe(true);
  });

  it("de pijl vergelijkt de laatste hele week met de week ervoor, niet de lopende", () => {
    expect(richting([0, 0, 0, 0, 0, 3, 5, 0])).toBe("omhoog");
    expect(richting([0, 0, 0, 0, 0, 5, 3, 99])).toBe("omlaag");
    expect(richting([0, 0, 0, 0, 0, 4, 4, 1])).toBe("gelijk");
    expect(richting([1, 2])).toBeNull();
  });
});

describe("wat als echt telt", () => {
  const lid = (email: string, rollen: string[] = ["COMPANY_ADMIN"], id = "u1") => ({ id, email, disabledAt: null, rollen });

  it("een bedrijf met een echt lid telt; het eigen testbedrijf, een bedrijf van alleen beheerders of testadressen niet", () => {
    expect(isEchtBedrijf({ id: "t1", name: "Bakkerij De Korrel", leden: [lid("info@dekorrel.nl")] }, LEGE_EIGEN_TEST)).toBe(true);
    expect(isEchtBedrijf({ id: "t2", name: "Test bedrijven", leden: [lid("info@dekorrel.nl")] }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchtBedrijf({ id: "t3", name: "Jan", leden: [lid("eigenaar@voorbeeld.nl", ["PLATFORM_ADMIN", "COMPANY_ADMIN"])] }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchtBedrijf({ id: "t4", name: "Rondgang Testbedrijf", leden: [lid("rondgang@zekerflex.test")] }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchtBedrijf({ id: "t5", name: "Leeg", leden: [] }, LEGE_EIGEN_TEST)).toBe(false);
    // in het beheer als eigen test gemarkeerd: telt niet, ook met een echt lid
    expect(isEchtBedrijf({ id: "t1", name: "Bakkerij De Korrel", leden: [lid("info@dekorrel.nl")] }, { tenants: { t1: "2026-11-01T00:00:00Z" }, users: {} })).toBe(false);
  });

  it("een aanmelding telt niet als hij test, intern, beheer of eigen test is", () => {
    const basis = { id: "u1", email: "sanne@voorbeeld.nl", disabledAt: null, rollen: ["FREELANCER"], tenantIds: [] as string[], tenantNamen: [] as string[] };
    expect(isEchteAanmelding(basis, LEGE_EIGEN_TEST)).toBe(true);
    expect(isEchteAanmelding({ ...basis, email: "sanne@klant.test" }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchteAanmelding({ ...basis, id: "usr_zf_bot" }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchteAanmelding({ ...basis, rollen: ["PLATFORM_ADMIN"] }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchteAanmelding({ ...basis, tenantIds: ["t9"], tenantNamen: ["Test bedrijven"] }, LEGE_EIGEN_TEST)).toBe(false);
    expect(isEchteAanmelding({ ...basis, tenantIds: ["t9"], tenantNamen: ["Bakkerij"] }, { tenants: { t9: "2026-11-01T00:00:00Z" }, users: {} })).toBe(false);
    expect(isEchteAanmelding(basis, { tenants: {}, users: { u1: "2026-11-01T00:00:00Z" } })).toBe(false);
  });
});

describe("waar het staat", () => {
  it("op het startscherm, met de werkgeverstrechter en de cockpit op dezelfde regel", () => {
    const pagina = lees("app/admin/page.tsx");
    expect(pagina).toContain("<WeekCijfersKaart cijfers={week} />");
    expect(pagina).toContain("haalWeekCijfers()");
    expect(lees("lib/admin/werkgever-trechter.ts")).toContain("isEchtBedrijf(");
    const cockpit = lees("lib/admin/cockpit.ts");
    expect(cockpit).toContain("...echtFilter");
    expect(cockpit).toContain("...zonderTest");
    expect(lees("lib/admin/insights/home.ts")).toContain("echteAanmeldingen(prevFrom");
  });

  it("een vegende tabel heeft een gepositioneerde ouder voor de sr-only-tekst", () => {
    const kaart = lees("components/admin/WeekCijfersKaart.tsx");
    expect(kaart).toContain('className="relative overflow-x-auto"');
    expect(kaart).not.toContain('"use client"');
  });
});
