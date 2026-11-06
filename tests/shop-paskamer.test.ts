import { describe, expect, it } from "vitest";
import { LOOKS, STANDAARD_LICHAAM, kleurHex, maatAdvies, maten, pastBijSilhouet, pasvormVoor, type Lichaam } from "@/lib/shop/paskamer";
import { figuur, kledingstuk, lijf, tint, vloeiend } from "@/lib/shop/paspop-figuur";

const man = (extra: Partial<Lichaam> = {}): Lichaam => ({ ...STANDAARD_LICHAAM.heren, ...extra });
const vrouw = (extra: Partial<Lichaam> = {}): Lichaam => ({ ...STANDAARD_LICHAAM.dames, ...extra });
const LETTERS = ["S", "M", "L", "XL", "XXL"];

describe("lichaamsmaten", () => {
  it("schat een gemiddelde man van 180 cm / 80 kg rond borst 99 en taille 92", () => {
    const m = maten(man({ gewicht: 80 }));
    expect(m.borst).toBeGreaterThan(95);
    expect(m.borst).toBeLessThan(103);
    expect(m.taille).toBeGreaterThan(87);
    expect(m.taille).toBeLessThan(96);
    expect(m.geschat.borst).toBe(true);
  });

  it("neemt gemeten maten over in plaats van te schatten", () => {
    const m = maten(man({ borst: 104, taille: 88, schoenmaat: 44 }));
    expect(m.borst).toBe(104);
    expect(m.taille).toBe(88);
    expect(m.schoenmaat).toBe(44);
    expect(m.geschat).toEqual({ borst: false, taille: false, schoenmaat: false });
  });

  it("een stevige bouw geeft een grotere borst dan een slanke", () => {
    expect(maten(man({ bouw: "stevig" })).borst).toBeGreaterThan(maten(man({ bouw: "slank" })).borst);
  });
});

describe("maatadvies", () => {
  it("bovenkleding volgt de borstomtrek", () => {
    expect(maatAdvies("boven", LETTERS, man({ borst: 98 })).maat).toBe("M");
    expect(maatAdvies("boven", LETTERS, man({ borst: 110 })).maat).toBe("XL");
    expect(maatAdvies("boven", ["XS", "S", "M", "L", "XL"], vrouw({ borst: 88 })).maat).toBe("M");
  });

  it("een te kleine of te grote keuze krijgt een eerlijk oordeel", () => {
    const l = man({ borst: 104 });
    expect(maatAdvies("boven", LETTERS, l).maat).toBe("L");
    expect(maatAdvies("boven", LETTERS, l, "L").oordeel).toBe("goed");
    expect(maatAdvies("boven", LETTERS, l, "S").oordeel).toBe("krap");
    expect(maatAdvies("boven", LETTERS, l, "XXL").oordeel).toBe("te-ruim");
    expect(maatAdvies("boven", LETTERS, l, "XL").ruimte).toBeGreaterThan(0);
  });

  it("voorkeur ruim of nauw schuift één maat op", () => {
    expect(maatAdvies("boven", LETTERS, man({ borst: 98, voorkeur: "ruim" })).maat).toBe("L");
    expect(maatAdvies("boven", LETTERS, man({ borst: 98, voorkeur: "nauw" })).maat).toBe("S");
  });

  it("broeken volgen de taille, een hesje gaat over de jas heen", () => {
    expect(maatAdvies("onder", LETTERS, man({ taille: 90 })).maat).toBe("L");
    expect(maatAdvies("over", ["M", "L", "XL", "XXL"], man({ borst: 98 })).maat).toBe("L");
  });

  it("schoenen en sokken op schoenmaat, kindermaten op lengte", () => {
    const schoenen = ["38", "39", "40", "41", "42", "43", "44", "45", "46", "47"];
    expect(maatAdvies("schoen", schoenen, man({ schoenmaat: 44 })).maat).toBe("44");
    expect(maatAdvies("schoen", schoenen, man({ schoenmaat: 44 }), "42").oordeel).toBe("krap");
    expect(maatAdvies("sok", ["39-42", "43-46"], man({ schoenmaat: 44 })).maat).toBe("43-46");
    const kids = ["98", "110", "122", "134", "146", "158", "170"];
    expect(maatAdvies("kind", kids, { ...STANDAARD_LICHAAM.kind, lengte: 130 }).maat).toBe("134");
    expect(maatAdvies("kind", kids, { ...STANDAARD_LICHAAM.kind, lengte: 140 }).maat).toBe("146");
  });

  it("producten zonder maten krijgen geen maatadvies", () => {
    expect(maatAdvies("geen", [], man()).maat).toBeNull();
    expect(maatAdvies("boven", [], man()).maat).toBeNull();
  });
});

describe("kledingstukken uit de catalogus", () => {
  it("koppelt de eigen producten op slug en valt terug op de naam", () => {
    expect(pasvormVoor({ slug: "veiligheidshesje", name: "Reflecterend veiligheidshesje" })?.stukken[0]?.slot).toBe("hesje");
    expect(pasvormVoor({ slug: "winterpakket-bodywarmer-fleece", name: "Winterpakket" })?.stukken.map((s) => s.slot)).toEqual(["midden", "jas"]);
    expect(pasvormVoor({ slug: "iets-nieuws", name: "Werkbroek stretch", firstColor: "Marineblauw" })).toMatchObject({ systeem: "onder", kleur: "#1f2f4f" });
    expect(pasvormVoor({ slug: "kids-polo", name: "Polo", gender: "kinderen" })?.systeem).toBe("kind");
  });

  it("niet-draagbare producten blijven buiten de paskamer", () => {
    expect(pasvormVoor({ slug: "shift-bottle", name: "Shift Bottle" })).toBeNull();
    expect(pasvormVoor({ slug: "vca-basis-boek", name: "VCA Basisveiligheid — lesboek (NL)" })).toBeNull();
    expect(pasvormVoor({ slug: "gehoorbescherming-oordoppen", name: "Gehoorbescherming — oordoppen" })).toBeNull();
  });

  it("kleurnamen worden kleuren, ook met spaties", () => {
    expect(kleurHex("Zwart")).toBe("#1d1f22");
    expect(kleurHex("Fluor geel")).toBe("#e4f23d");
    expect(kleurHex("Onbekend")).toBeNull();
  });

  it("kinderkleding alleen op een kind, one-size overal", () => {
    expect(pastBijSilhouet({ gender: "kinderen", systeem: "kind" }, "kind")).toBe(true);
    expect(pastBijSilhouet({ gender: "kinderen", systeem: "kind" }, "heren")).toBe(false);
    expect(pastBijSilhouet({ gender: null, systeem: "boven" }, "kind")).toBe(false);
    expect(pastBijSilhouet({ gender: null, systeem: "geen" }, "kind")).toBe(true);
  });

  it("elke look verwijst naar bestaande producten in de koppeltabel", () => {
    for (const look of LOOKS) for (const slug of look.slugs) expect(pasvormVoor({ slug, name: slug }), slug).not.toBeNull();
  });
});

describe("de tekening", () => {
  it("vloeiende paden zijn gesloten en bevatten geen NaN", () => {
    const d = vloeiend([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("tekent elk kledingstuk zonder kapotte getallen, voor man, vrouw en kind", () => {
    const soorten = ["tshirt", "overhemd", "blouse", "hoodie", "overshirt", "fleece", "bodywarmer", "softshell", "hesje", "chino", "werkbroek", "thermobroek", "riem", "kniebeschermer", "werkschoen", "sneaker", "antislip", "sokken", "handschoen", "snijhandschoen", "pet", "helm", "bril", "tas"] as const;
    for (const l of [man(), vrouw(), STANDAARD_LICHAAM.kind]) {
      const f = figuur(l, maten(l));
      const body = lijf(f, l);
      expect(JSON.stringify(body)).not.toMatch(/NaN|Infinity/);
      for (const s of soorten) {
        const t = kledingstuk(f, s, "#336699", "#ffcc00", 0);
        expect(t.voor.length, s).toBeGreaterThan(0);
        expect(JSON.stringify(t), s).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("een ruimere maat tekent een breder kledingstuk (romp = na de twee mouwen)", () => {
    const l = man();
    const f = figuur(l, maten(l));
    const breedte = (d: string) => {
      const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      return Math.max(...xs) - Math.min(...xs);
    };
    const krap = kledingstuk(f, "tshirt", "#336699", undefined, -6).voor[2]?.d ?? "";
    const ruim = kledingstuk(f, "tshirt", "#336699", undefined, 14).voor[2]?.d ?? "";
    expect(breedte(ruim)).toBeGreaterThan(breedte(krap));
  });

  it("tint maakt donkerder en lichter", () => {
    expect(tint("#808080", 0.5)).toBe("#404040");
    expect(tint("#000000", 1.5)).toBe("#808080");
  });
});

describe("openbare productlijst", () => {
  it("laat de inkoopprijs en interne verkopersvelden weg", async () => {
    const { publiekProduct } = await import("@/lib/shop/publiek");
    const uit = publiekProduct({ id: "p1", name: "Hesje", priceCents: 695, costCents: 210, sellerNote: "intern", sellerStatus: "goedgekeurd", sellerTenantId: "t1", variants: [] });
    expect(uit).toEqual({ id: "p1", name: "Hesje", priceCents: 695, variants: [] });
  });
});

describe("opgeslagen paskamer", () => {
  it("leest een geldige stand terug en valt bij rommel terug op de standaard", async () => {
    const { leesStand, STANDAARD_STAND } = await import("@/components/marketing/paskamer/usePaskamer");
    expect(leesStand(null)).toEqual(STANDAARD_STAND);
    expect(leesStand("{kapot")).toEqual(STANDAARD_STAND);
    const s = leesStand(JSON.stringify({ lichaam: { silhouet: "dames", lengte: 172, gewicht: 64, borst: "x", voorkeur: "ruim" }, huid: "#c58c6a", gezicht: "javascript:alert(1)", aan: [{ productId: "p1", maat: "M" }, { kapot: true }] }));
    expect(s.lichaam).toMatchObject({ silhouet: "dames", lengte: 172, gewicht: 64, borst: null, voorkeur: "ruim" });
    expect(s.huid).toBe("#c58c6a");
    expect(s.gezicht).toBeNull();
    expect(s.aan).toEqual([{ productId: "p1", maat: "M", kleur: null }]);
  });

  it("een lengte buiten het silhouet wordt de standaardlengte", async () => {
    const { leesStand } = await import("@/components/marketing/paskamer/usePaskamer");
    expect(leesStand(JSON.stringify({ lichaam: { silhouet: "kind", lengte: 250 } })).lichaam.lengte).toBe(134);
  });
});

describe("3D-paspop", () => {
  it("koppelt elke kledingsoort aan een bestaand 3D-onderdeel", async () => {
    const { stuk3D } = await import("@/lib/shop/paspop3d/kleding");
    const fs = await import("node:fs");
    const manifest = JSON.parse(fs.readFileSync("public/paskamer/3d/manifest.json", "utf8")) as { delen: Record<string, unknown> };
    const soorten = ["tshirt", "overhemd", "blouse", "hoodie", "overshirt", "fleece", "bodywarmer", "softshell", "hesje", "chino", "werkbroek", "thermobroek", "werkschoen", "sneaker", "antislip"] as const;
    for (const sil of ["heren", "dames", "kind"] as const) {
      for (const s of soorten) {
        const d = stuk3D(s, "top", sil);
        if (d && "deel" in d) expect(manifest.delen[d.deel], `${s}/${sil}`).toBeDefined();
      }
    }
  });

  it("gewichtfactor loopt van slank (-1) tot zwaar (+1)", async () => {
    const { gewichtFactor } = await import("@/lib/shop/paspop3d/model");
    expect(gewichtFactor("heren", 23.5)).toBe(0);
    expect(gewichtFactor("heren", 10)).toBe(-1);
    expect(gewichtFactor("dames", 60)).toBe(1);
  });

  it("de gezichtsfoto komt met de ogen op de ogen van het model", async () => {
    const { gezichtsVlak, FOTO_OGEN } = await import("@/lib/shop/paspop3d/model");
    const v = gezichtsVlak([0, 7.28, 1.25], [0, 6.16, 1.35]);
    const top = v.midden[1] + v.maat[1] / 2;
    expect(top - FOTO_OGEN * v.maat[1]).toBeCloseTo(7.28, 5);
    expect(v.maat[0]).toBeCloseTo(v.maat[1] * 0.8, 5);
  });

  it("de opgeslagen stand kent haar met veilige standaardwaarden", async () => {
    const { leesStand } = await import("@/components/marketing/paskamer/usePaskamer");
    const s = leesStand(JSON.stringify({ lichaam: { silhouet: "dames" }, haar: "raar", haarKleur: "rood" }));
    expect(s.haar).toBe("staart");
    expect(s.haarKleur).toBe("#3b2a1f");
  });
});

describe("3D-riem en tas", () => {
  it("riem en tas worden accessoires op de paspop", async () => {
    const { stuk3D } = await import("@/lib/shop/paspop3d/kleding");
    expect(stuk3D("riem", "riem", "heren")).toEqual({ extra: "riem" });
    expect(stuk3D("tas", "tas", "dames")).toEqual({ extra: "tas" });
    expect(stuk3D("sokken", "sokken", "heren")).toBeNull();
  });
});
