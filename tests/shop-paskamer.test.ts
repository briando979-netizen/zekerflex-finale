import { describe, expect, it } from "vitest";
import { LOOKS, STANDAARD_LICHAAM, kleurHex, maatAdvies, maten, pastBijSilhouet, pasvormVoor, type Lichaam } from "@/lib/shop/paskamer";

// De paskamer van de webshop (de tekening, de 3D-paspop en de opgeslagen stand) is op 22 nov 2026 weggehaald. De maten en
// de koppeling van producten aan kledingstukken (lib/shop/paskamer.ts) blijven: de productlijst en de winkel-AI gebruiken ze.

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

describe("openbare productlijst", () => {
  it("laat de inkoopprijs en interne verkopersvelden weg", async () => {
    const { publiekProduct } = await import("@/lib/shop/publiek");
    const uit = publiekProduct({ id: "p1", name: "Hesje", priceCents: 695, costCents: 210, sellerNote: "intern", sellerStatus: "goedgekeurd", sellerTenantId: "t1", variants: [] });
    expect(uit).toEqual({ id: "p1", name: "Hesje", priceCents: 695, variants: [] });
  });
});
