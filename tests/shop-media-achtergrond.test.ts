import { describe, expect, it } from "vitest";
import { GEEN_ACHTERGROND, kiesWeergave, leesInstelling, leesKeuze, magVideoSpelen } from "@/lib/ontwerp/achtergrond-core";

const FOTO = "mabcdefghij123";
const FOTO2 = "mzzzzzzzzzz999";
const VIDEO = "mvideovideo777";
const media = [
  { id: FOTO, soort: "foto" as const, alt: "Paraplu" },
  { id: FOTO2, soort: "foto" as const, alt: "" },
  { id: VIDEO, soort: "video" as const, alt: "" },
];

describe("achtergrond: standaard verandert niets", () => {
  it("lege of kapotte opslag geeft voor elke pagina geen achtergrond", () => {
    for (const raw of [null, undefined, "x", 5, [], {}, { shop: "x", home: { media: 3 } }]) {
      expect(leesInstelling(raw)).toEqual(GEEN_ACHTERGROND);
    }
  });
  it("zonder keuze of met een verwijderd bestand wordt er niets getoond", () => {
    expect(kiesWeergave(null, media)).toBeNull();
    expect(kiesWeergave({ media: "mnietbestaand00" }, media)).toBeNull();
  });
});

describe("achtergrond: lezen en kiezen", () => {
  it("leest een geldige keuze en laat een kapotte pagina los zonder de ander te raken", () => {
    const i = leesInstelling({ shop: { media: FOTO }, home: { media: "../etc" } });
    expect(i.shop).toEqual({ media: FOTO });
    expect(i.home).toBeNull();
  });
  it("een verzoek: null = geen, ongeldig = undefined", () => {
    expect(leesKeuze(null)).toBeNull();
    expect(leesKeuze({ media: FOTO, poster: FOTO2 })).toEqual({ media: FOTO, poster: FOTO2 });
    expect(leesKeuze({ media: "kapot" })).toBeUndefined();
    expect(leesKeuze({ media: FOTO, poster: "kapot" })).toBeUndefined();
    expect(leesKeuze("x")).toBeUndefined();
  });
  it("foto: groot bestand; video: poster is de kleine versie van een foto", () => {
    expect(kiesWeergave({ media: FOTO }, media)).toEqual({ soort: "foto", src: `/beeld/${FOTO}`, alt: "Paraplu" });
    expect(kiesWeergave({ media: VIDEO, poster: FOTO2 }, media)).toEqual({ soort: "video", src: `/beeld/${VIDEO}`, poster: `/beeld/${FOTO2}?klein=1` });
    expect(kiesWeergave({ media: VIDEO }, media)).toEqual({ soort: "video", src: `/beeld/${VIDEO}`, poster: null });
    // een video is geen geldig stilstaand beeld
    expect(kiesWeergave({ media: VIDEO, poster: VIDEO }, media)).toEqual({ soort: "video", src: `/beeld/${VIDEO}`, poster: null });
  });
  it("video speelt niet bij minder beweging of databesparing", () => {
    expect(magVideoSpelen({ minderBeweging: false, dataBesparing: false })).toBe(true);
    expect(magVideoSpelen({ minderBeweging: true, dataBesparing: false })).toBe(false);
    expect(magVideoSpelen({ minderBeweging: false, dataBesparing: true })).toBe(false);
  });
});

