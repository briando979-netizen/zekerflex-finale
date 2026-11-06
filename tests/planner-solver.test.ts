import { describe, expect, it } from "vitest";
import { afstandKm, belemmeringen, kandidatenVoor, losOpIntern, type PlanDienst, type PlanKracht } from "@/lib/planner/solver";

// De roosterplanner: alle plekken gevuld tegen de laagste kosten, binnen de
// harde regels (certificaten, overlap, rust, weekuren, reisafstand).

const T0 = Date.UTC(2026, 10, 9, 8, 0); // ma 9 nov 2026 09:00 NL
const uur = 3_600_000;

const dienst = (p: Partial<PlanDienst> & { id: string }): PlanDienst => ({
  titel: p.id,
  locatie: "Utrecht",
  start: T0,
  einde: T0 + 8 * uur,
  pauzeMinuten: 30,
  plekken: 1,
  uurtariefCents: 2000,
  lat: 52.09,
  lng: 5.12,
  certificaten: [],
  skillId: null,
  ...p,
});

const kracht = (p: Partial<PlanKracht> & { id: string }): PlanKracht => ({
  naam: p.id,
  lat: 52.09,
  lng: 5.13,
  certificaten: [],
  skillIds: [],
  betrouwbaarheid: 0.9,
  bezet: [],
  weekMinuten: 0,
  ...p,
});

describe("belemmeringen", () => {
  it("certificaat, vak, afstand, overlap, rust en weekuren", () => {
    const d = dienst({ id: "d1", certificaten: ["VCA_BASIS"], skillId: "s1" });
    expect(belemmeringen(d, kracht({ id: "k" }), { maxReisKm: 40, maxWeekUren: 60, rustUren: 11, voorkeur: "balans", reiskostenPerKmCents: 23 })).toEqual(["mist certificaat VCA_BASIS", "heeft het vak niet"]);
    const i = { maxReisKm: 40, maxWeekUren: 60, rustUren: 11, voorkeur: "balans" as const, reiskostenPerKmCents: 23 };
    const ok = kracht({ id: "k", certificaten: ["VCA_BASIS"], skillIds: ["s1"] });
    expect(belemmeringen(d, ok, i)).toEqual([]);
    expect(belemmeringen(d, { ...ok, lat: 53.2, lng: 6.57 }, i)[0]).toMatch(/te ver/); // Groningen
    expect(belemmeringen(d, { ...ok, bezet: [{ start: T0 + 2 * uur, einde: T0 + 4 * uur }] }, i)[0]).toMatch(/al ingepland/);
    // dienst eindigt 17:00; een dienst tot 08:00 diezelfde ochtend geeft maar 1 uur rust
    expect(belemmeringen(d, { ...ok, bezet: [{ start: T0 - 9 * uur, einde: T0 - 1 * uur }] }, i)[0]).toMatch(/rust/);
    expect(belemmeringen(d, { ...ok, bezet: [{ start: T0 - 20 * uur, einde: T0 - 12 * uur }] }, i)).toEqual([]);
    expect(belemmeringen(d, { ...ok, weekMinuten: 56 * 60 }, i)[0]).toMatch(/boven 60 uur/);
    expect(belemmeringen(d, { ...ok, lat: 52.2, lng: 5.2, maxReisMinuten: 10 }, i)[0]).toMatch(/eigen reistijd/);
    expect(belemmeringen(d, { ...ok, minUurtariefCents: 2500 }, i)[0]).toMatch(/minimum/);
  });

  it("afstand is hemelsbreed met omrijfactor", () => {
    const km = afstandKm({ lat: 52.09, lng: 5.12 }, { lat: 52.37, lng: 4.9 }); // Utrecht–Amsterdam ≈ 35 km
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(50);
  });
});

describe("losOpIntern", () => {
  it("vult alle plekken en kiest de dichtstbijzijnde bij gelijke betrouwbaarheid", () => {
    const r = losOpIntern([dienst({ id: "d1", plekken: 2 })], [kracht({ id: "ver", lat: 52.3, lng: 5.3 }), kracht({ id: "dichtbij" }), kracht({ id: "midden", lat: 52.15, lng: 5.2 })]);
    expect(r.toewijzingen.map((t) => t.krachtId)).toEqual(["dichtbij", "midden"]);
    expect(r.onvervuld).toEqual([]);
    expect(r.totaal).toMatchObject({ plekken: 2, gevuld: 2, bezettingPct: 100 });
    expect(r.totaal.loonCents).toBe(2 * Math.round(7.5 * 2000));
    expect(r.oplosser).toBe("intern");
  });

  it("zet één kracht nooit op twee diensten tegelijk en meldt wat open blijft", () => {
    const r = losOpIntern([dienst({ id: "d1" }), dienst({ id: "d2", start: T0 + 2 * uur, einde: T0 + 10 * uur })], [kracht({ id: "k1" })]);
    expect(r.toewijzingen).toHaveLength(1);
    expect(r.onvervuld).toHaveLength(1);
    expect(r.onvervuld[0]?.reden).toMatch(/1 van 1 krachten: al ingepland/);
  });

  it("bewaart een schaarse kracht voor de dienst die alleen hij kan doen", () => {
    // twee diensten tegelijk: k1 heeft VCA en is goedkoper voor d-gewoon, maar alleen k1 kan d-vca
    const r = losOpIntern(
      [dienst({ id: "d-gewoon" }), dienst({ id: "d-vca", certificaten: ["VCA_BASIS"] })],
      [kracht({ id: "k1", certificaten: ["VCA_BASIS"] }), kracht({ id: "k2", lat: 52.12, lng: 5.15 })],
    );
    const per = Object.fromEntries(r.toewijzingen.map((t) => [t.dienstId, t.krachtId]));
    expect(per["d-vca"]).toBe("k1");
    expect(per["d-gewoon"]).toBe("k2");
    expect(r.onvervuld).toEqual([]);
  });

  it("respecteert de weekgrens en de rust tussen diensten", () => {
    const diensten = [0, 1, 2, 3, 4, 5, 6].map((n) => dienst({ id: `d${n}`, start: T0 + n * 24 * uur, einde: T0 + n * 24 * uur + 10 * uur, pauzeMinuten: 0 }));
    const r = losOpIntern(diensten, [kracht({ id: "k1" })], { maxWeekUren: 40 });
    expect(r.toewijzingen).toHaveLength(4);
    expect(r.onvervuld).toHaveLength(3);
    expect(r.onvervuld[0]?.reden).toMatch(/boven 40 uur/);
  });

  it("betrouwbaarheid weegt zwaarder als de voorkeur dat zegt", () => {
    const krachten = [kracht({ id: "dichtbij-onbetrouwbaar", betrouwbaarheid: 0.4 }), kracht({ id: "verder-betrouwbaar", lat: 52.2, lng: 5.2, betrouwbaarheid: 1 })];
    expect(losOpIntern([dienst({ id: "d1" })], krachten, { voorkeur: "kosten" }).toewijzingen[0]?.krachtId).toBe("dichtbij-onbetrouwbaar");
    expect(losOpIntern([dienst({ id: "d1" })], krachten, { voorkeur: "betrouwbaarheid" }).toewijzingen[0]?.krachtId).toBe("verder-betrouwbaar");
  });

  it("is deterministisch en geeft de kandidaten voor de rekendienst", () => {
    const diensten = [dienst({ id: "d1", plekken: 2 }), dienst({ id: "d2", start: T0 + 24 * uur, einde: T0 + 32 * uur })];
    const krachten = [kracht({ id: "a" }), kracht({ id: "b", lat: 52.1 }), kracht({ id: "c", lat: 52.11 })];
    expect(losOpIntern(diensten, krachten).toewijzingen).toEqual(losOpIntern(diensten, krachten).toewijzingen);
    const kandidaten = kandidatenVoor(diensten, krachten);
    expect(kandidaten).toHaveLength(6);
    expect(kandidaten[0]).toMatchObject({ dienstId: "d1", krachtId: "a", redenen: [] });
    expect(kandidaten[0]!.score).toBeGreaterThan(0);
  });

  it("zonder diensten of krachten", () => {
    expect(losOpIntern([], [kracht({ id: "k" })]).totaal.bezettingPct).toBe(100);
    const r = losOpIntern([dienst({ id: "d1" })], []);
    expect(r.onvervuld[0]?.reden).toBe("geen beschikbare krachten");
  });
});
