import { describe, expect, it } from "vitest";
import { POSE, beoordeelFoto, breedteOpRij, dichtstbij, ellipsOmtrek, gemiddeldeKleur, gezichtsKader, huidVoorPaspop, meetLichaam, type Punt } from "@/lib/shop/foto-meting";

/** Een nagemaakte persoon van voren op een foto van 600 × 1400 px. */
function mens(): { p: Punt[]; masker: Float32Array; w: number; h: number } {
  const w = 600;
  const h = 1400;
  const p: Punt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const zet = (i: number, x: number, y: number) => (p[i] = { x: x / w, y: y / h, visibility: 1 });
  zet(POSE.neus, 300, 130);
  zet(POSE.oogL, 280, 110);
  zet(POSE.oogR, 320, 110);
  zet(POSE.schouderL, 160, 300);
  zet(POSE.schouderR, 440, 300);
  zet(POSE.heupL, 235, 700);
  zet(POSE.heupR, 365, 700);
  zet(POSE.enkelL, 255, 1290);
  zet(POSE.enkelR, 345, 1290);
  zet(POSE.hielL, 255, 1330);
  zet(POSE.hielR, 345, 1330);
  // masker: hoofd (60 breed), romp 220 breed op de schouders en 190 op de heupen, benen
  const masker = new Float32Array(w * h);
  const vul = (y0: number, y1: number, breedte: (y: number) => number) => {
    for (let y = y0; y < y1; y++) {
      const half = breedte(y) / 2;
      for (let x = Math.round(300 - half); x <= Math.round(300 + half); x++) masker[y * w + x] = 1;
    }
  };
  vul(60, 280, () => 90); // hoofd en nek
  vul(280, 760, (y) => 260 - ((y - 280) / 420) * 30 + (y > 560 ? 20 : 0)); // romp (± 245 breed)
  vul(760, 1340, () => 190); // benen
  return { p, masker, w, h };
}

describe("foto beoordelen", () => {
  it("accepteert een hele persoon van voren", () => {
    const m = mens();
    expect(beoordeelFoto(m.p, m.w, m.h)).toEqual([]);
  });

  it("herkent geen mens, een afgeknipte persoon en iemand van opzij", () => {
    expect(beoordeelFoto(null, 600, 1400)).toEqual(["geen-mens"]);
    const m = mens();
    m.p[POSE.enkelL] = { x: 0.4, y: 1.2, visibility: 0.2 };
    expect(beoordeelFoto(m.p, m.w, m.h)).toContain("niet-heel");
    const z = mens();
    z.p[POSE.schouderL] = { x: 280 / 600, y: 300 / 1400, visibility: 1 };
    z.p[POSE.schouderR] = { x: 320 / 600, y: 300 / 1400, visibility: 1 };
    expect(beoordeelFoto(z.p, z.w, z.h)).toContain("niet-voor");
  });

  it("een te klein beeld wordt gemeld", () => {
    const m = mens();
    expect(beoordeelFoto(m.p, 100, 200)).toContain("klein");
  });
});

describe("lichaam meten", () => {
  it("rekent uit de lengte de schaal en uit de breedtes de omtrekken", () => {
    const { p, masker, w, h } = mens();
    const m = meetLichaam(masker, w, h, p, 180);
    expect(m).not.toBeNull();
    if (!m) return;
    // kruin 60 → voetzool ±1335: 1275 px voor 180 cm
    expect(m.schaal).toBeGreaterThan(6.5);
    expect(m.schaal).toBeLessThan(7.5);
    expect(m.borst).toBeGreaterThan(85);
    expect(m.borst).toBeLessThan(125);
    expect(m.taille).toBeGreaterThan(70);
    expect(m.taille).toBeLessThan(120);
    expect(m.heup).toBeGreaterThan(80);
    expect(m.heup).toBeLessThan(120);
  });

  it("dezelfde foto bij een langere persoon betekent een breder lichaam: de maten stijgen", () => {
    const { p, masker, w, h } = mens();
    const a = meetLichaam(masker, w, h, p, 170);
    const b = meetLichaam(masker, w, h, p, 190);
    expect((b?.borst ?? 0) > (a?.borst ?? 0)).toBe(true);
  });

  it("geeft null als er te weinig van de persoon te meten valt", () => {
    const { p, w, h } = mens();
    expect(meetLichaam(new Float32Array(w * h), w, h, p, 180)).toBeNull();
    expect(meetLichaam(new Float32Array(w * h), w, h, p.slice(0, 10), 180)).toBeNull();
  });

  it("breedte op een rij loopt vanuit het midden tot het masker ophoudt", () => {
    const masker = new Float32Array(10 * 3);
    for (let x = 2; x <= 7; x++) masker[1 * 10 + x] = 1;
    expect(breedteOpRij(masker, 10, 3, 1, 5, 20)).toEqual({ links: 3, rechts: 2 });
    expect(breedteOpRij(masker, 10, 3, 1, 5, 1)).toEqual({ links: 1, rechts: 1 });
  });

  it("ellipsomtrek klopt voor een cirkel en een ovaal", () => {
    expect(ellipsOmtrek(10, 10)).toBeCloseTo(Math.PI * 10, 3);
    expect(ellipsOmtrek(40, 26)).toBeGreaterThan(100);
    expect(ellipsOmtrek(40, 26)).toBeLessThan(115);
  });
});

describe("gezicht en kleuren", () => {
  it("het gezichtskader heeft de ogen op 45 % en is 0,8 × zo breed als hoog", () => {
    const k = gezichtsKader({ x: 280 / 600, y: 0.2 }, { x: 320 / 600, y: 0.2 }, 600, 1000);
    expect(k.w / k.h).toBeCloseTo(0.8, 5);
    expect((0.2 * 1000 - k.y) / k.h).toBeCloseTo(0.45, 5);
    expect(k.h).toBeCloseTo(40 * 3.5, 5);
  });

  it("middelt kleuren en slaat transparante of te donkere punten over", () => {
    const data = new Uint8ClampedArray(4 * 20);
    for (let i = 0; i < 20; i++) data.set([200, 150, 120, 255], i * 4);
    data.set([0, 0, 0, 255], 0);
    expect(gemiddeldeKleur(data, 1)).toBe("#c89678");
    expect(gemiddeldeKleur(new Uint8ClampedArray(8), 1)).toBeNull();
  });

  it("kiest de dichtstbijzijnde haarkleur en glad de huid", () => {
    expect(dichtstbij("#2a1c12", ["#1b1612", "#d8b679", "#9a9a98"])).toBe("#1b1612");
    expect(dichtstbij("#e0c080", ["#1b1612", "#d8b679", "#9a9a98"])).toBe("#d8b679");
    expect(huidVoorPaspop("#c89678")).toBe("#c89678");
    expect(huidVoorPaspop("#201008")).not.toBe("#201008");
  });
});
