import { describe, expect, it } from "vitest";
import { STANDAARD_GROEN, haalKleurWeg, hexNaarRgb } from "@/lib/video/groen-scherm";
import { leegProject, nieuweBeeldClip, schoonProject, type BeeldClip } from "@/lib/video/model";

// Groen scherm in de video-editor (13 nov 2026): een effen achtergrond doorzichtig maken.

const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());
const groen = hexNaarRgb(STANDAARD_GROEN.kleur);

describe("de kleur weghalen", () => {
  it("het groene doek wordt helemaal doorzichtig, ook in de schaduw; wit en huid blijven", () => {
    const d = pixels([0, 177, 64, 255], [0, 90, 32, 255], [255, 255, 255, 255], [224, 172, 140, 255]);
    haalKleurWeg(d, groen, STANDAARD_GROEN.drempel, STANDAARD_GROEN.zachtheid);
    expect(d[3]).toBe(0);
    expect(d[7]).toBe(0);
    expect(d[11]).toBe(255);
    expect(d[15]).toBe(255);
    expect(Array.from(d.slice(8, 11))).toEqual([255, 255, 255]);
  });

  it("aan de rand half doorzichtig, zonder de groene gloed", () => {
    const d = pixels([90, 160, 90, 255]);
    haalKleurWeg(d, groen, STANDAARD_GROEN.drempel, STANDAARD_GROEN.zachtheid);
    expect(d[3]).toBeGreaterThan(0);
    expect(d[3]).toBeLessThan(255);
    expect(d[1]).toBe(90);
  });

  it("al doorzichtige pixels blijven doorzichtig; een blauw doek werkt ook", () => {
    const half = pixels([255, 255, 255, 128]);
    haalKleurWeg(half, groen, 0.18, 0.12);
    expect(half[3]).toBe(128);
    const blauw = pixels([20, 60, 230, 255], [255, 255, 255, 255]);
    haalKleurWeg(blauw, hexNaarRgb("#1e3cff"), 0.18, 0.12);
    expect(blauw[3]).toBe(0);
    expect(blauw[7]).toBe(255);
  });

  it("een onleesbare kleur valt terug op het standaardgroen", () => {
    expect(hexNaarRgb("groen")).toEqual([0, 177, 64]);
    expect(hexNaarRgb("#FF8800")).toEqual([255, 136, 0]);
  });
});

describe("opslaan en laden", () => {
  const video = (groenScherm: unknown) => ({ ...nieuweBeeldClip({ soort: "video", spoor: "s-overlay", start: 0, duur: 2, bron: "/api/admin/video/bestand/vabc1234567890" }), groenScherm });

  it("bewaart het groene scherm, begrensd; een kapotte kleur wordt het standaardgroen", () => {
    const [clip] = schoonProject({ ...leegProject(), clips: [video({ kleur: "lelijk", drempel: 3, zachtheid: -1 })] }).clips as BeeldClip[];
    expect(clip?.groenScherm).toEqual({ kleur: "#00b140", drempel: 1, zachtheid: 0 });
  });

  it("zonder groen scherm, of bij een kleurvlak: geen veld", () => {
    const [zonder] = schoonProject({ ...leegProject(), clips: [video(undefined)] }).clips;
    expect(zonder && "groenScherm" in zonder).toBe(false);
    const vlak = { ...nieuweBeeldClip({ soort: "kleur", spoor: "s-beeld", start: 0, duur: 2 }), groenScherm: STANDAARD_GROEN };
    const [kleur] = schoonProject({ ...leegProject(), clips: [vlak] }).clips;
    expect(kleur && "groenScherm" in kleur).toBe(false);
  });
});
