import { describe, expect, it } from "vitest";
import { golfPad, kiesMiniaturen, miniatuurMomenten, piekenUit } from "@/lib/video/golf";

// Golfvormen en kleine beelden op de tijdlijn van de video-editor (13 nov 2026).

const telStaafjes = (pad: string) => (pad.match(/M/g) ?? []).length;

describe("pieken uit het geluid", () => {
  it("de hoogste uitslag per stukje over alle kanalen, gedeeld door de luidste plek", () => {
    const links = new Float32Array([0, 0.5, 0.25, 0]);
    const rechts = new Float32Array([0.1, 0, 0, -1]);
    expect(Array.from(piekenUit([links, rechts], 4, 2))).toEqual([0.5, 1]);
  });

  it("stilte blijft nul (geen deling door nul), en geen geluid geeft geen pieken", () => {
    expect(Array.from(piekenUit([new Float32Array(8)], 8, 4))).toEqual([0, 0, 0, 0]);
    expect(piekenUit([], 44_100).length).toBe(0);
  });
});

describe("het pad van de golfvorm", () => {
  const pieken = new Float32Array([1, 0, 1, 0]);

  it("één staafje per 2 px; hard is hoog, stilte een dun streepje", () => {
    const pad = golfPad(pieken, 1, 0, 4, 8, 10);
    expect(telStaafjes(pad)).toBe(4);
    expect(pad).toContain("M0.0 0.3V9.8");
    expect(pad).toContain("M2.0 4.5V5.5");
  });

  it("alleen het stuk bron dat de clip laat horen", () => {
    expect(golfPad(pieken, 1, 2, 4, 4, 10).startsWith("M0.0 0.3V9.8")).toBe(true);
    expect(golfPad(pieken, 1, 1, 2, 2, 10)).toBe("M0.0 4.5V5.5");
  });

  it("niets te tekenen: te smal, geen stuk of geen pieken; heel breed blijft licht", () => {
    expect(golfPad(pieken, 1, 0, 4, 1, 10)).toBe("");
    expect(golfPad(pieken, 1, 3, 3, 100, 10)).toBe("");
    expect(golfPad(new Float32Array(0), 1, 0, 4, 100, 10)).toBe("");
    expect(telStaafjes(golfPad(pieken, 1, 0, 4, 100_000, 10))).toBe(1500);
  });
});

describe("kleine beelden uit een video", () => {
  it("één per 2 seconden, hooguit twaalf, in het midden van elk stuk", () => {
    expect(miniatuurMomenten(10)).toEqual([1, 3, 5, 7, 9]);
    const lang = miniatuurMomenten(60);
    expect(lang).toHaveLength(12);
    expect(lang[0]).toBe(2.5);
    expect(miniatuurMomenten(0)).toEqual([]);
    expect(miniatuurMomenten(Number.NaN)).toEqual([]);
  });

  it("elk vakje van de clip krijgt het beeld dat het dichtst bij zijn moment ligt", () => {
    expect(kiesMiniaturen([1, 3, 5, 7, 9], 2, 6, 2)).toEqual([1, 2]);
    expect(kiesMiniaturen([1, 3, 5, 7, 9], 0, 10, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(kiesMiniaturen([], 0, 10, 3)).toEqual([]);
    expect(kiesMiniaturen([1], 0, 10, 0)).toEqual([]);
  });
});
