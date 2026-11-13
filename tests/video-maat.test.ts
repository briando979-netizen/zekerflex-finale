import { describe, expect, it } from "vitest";
import { leegProject, magneetPunten, nieuweAudioClip, nieuweBeeldClip, schoonProject, type AudioClip, type BeeldClip, type Project } from "@/lib/video/model";
import { maatslagen, opDeMaat, slagenOpLijn, tempoVan } from "@/lib/video/maat";

// Op de maat in de video-editor (13 nov 2026): maatslagen zoeken op de golfvorm, ze op de tijdlijn zetten en het
// hoofdspoor erop laten wisselen.

/** 10 s muziek (60 pieken per seconde): zacht geluid met elke 0,5 s een harde tik. */
function tikken(): Float32Array {
  const p = new Float32Array(600).fill(0.1);
  for (let i = 30; i < 600; i += 30) p[i] = 1;
  return p;
}

describe("maatslagen zoeken", () => {
  it("vindt de harde tikken, elke halve seconde", () => {
    const slagen = maatslagen(tikken(), 60);
    expect(slagen).toHaveLength(19);
    expect(slagen[0]).toBe(0.5);
    expect(slagen[slagen.length - 1]).toBe(9.5);
    expect(tempoVan(slagen)).toBe(120);
  });

  it("stilte of gelijkmatig geluid geeft geen slagen; te dichte tikken worden er minder", () => {
    expect(maatslagen(new Float32Array(600), 60)).toEqual([]);
    expect(maatslagen(new Float32Array(600).fill(0.5), 60)).toEqual([]);
    const snel = new Float32Array(600).fill(0.1);
    for (let i = 6; i < 600; i += 6) snel[i] = 1;
    const slagen = maatslagen(snel, 60);
    expect(slagen.slice(1).every((s, i) => s - (slagen[i] ?? 0) >= 0.28 - 1e-9)).toBe(true);
  });

  it("het tempo: te weinig slagen is geen tempo", () => {
    expect(tempoVan([1])).toBeNull();
    expect(tempoVan([])).toBeNull();
    expect(tempoVan([0, 0.5, 1, 1.6, 2])).toBe(120);
  });
});

describe("maatslagen op de tijdlijn", () => {
  const muziek = nieuweAudioClip({ id: "m", spoor: "s-muziek", start: 5, duur: 4, bron: "/api/admin/video/bestand/vmuziek12345", inpunt: 2, slagen: [1, 2.5, 3, 7] });

  it("alleen wat de clip laat horen, op zijn plek in de tijd", () => {
    expect(slagenOpLijn(muziek)).toEqual([5.5, 6]);
    expect(slagenOpLijn({ ...muziek, snelheid: 2 })).toEqual([5.25, 5.5, 7.5]);
  });

  it("een clip klikt ook op een maatslag vast", () => {
    const p = { ...leegProject(), clips: [muziek] };
    expect(magneetPunten(p, "ander", 0)).toEqual(expect.arrayContaining([5.5, 6]));
  });

  it("opslaan houdt goede slagen, oplopend; de rest valt weg", () => {
    const p = { ...leegProject(), clips: [{ ...muziek, slagen: [3, 1, 1, -2, "x", 2, Number.NaN] }] };
    const [clip] = schoonProject(p).clips as AudioClip[];
    expect(clip?.slagen).toEqual([3]);
    const leeg = schoonProject({ ...leegProject(), clips: [{ ...muziek, slagen: "nee" }] }).clips[0];
    expect(leeg && "slagen" in leeg).toBe(false);
  });
});

describe("het hoofdspoor op de maat", () => {
  const foto = (id: string, start: number, duur: number) => nieuweBeeldClip({ id, soort: "foto", spoor: "s-beeld", start, duur, bron: "/stock/a.webp" });
  const metClips = (...clips: BeeldClip[]): Project => ({ ...leegProject(), clips });
  const slagen = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  const beeld = (p: Project) => p.clips.filter((c) => c.spoor === "s-beeld").sort((a, b) => a.start - b.start).map((c) => [c.id, c.start, c.duur]);

  it("elke clip wisselt op de volgende slag, de clips sluiten op elkaar aan", () => {
    const uit = opDeMaat(metClips(foto("a", 0, 1.7), foto("b", 1.7, 2.2), foto("c", 3.9, 1)), "s-beeld", slagen);
    expect(beeld(uit.project)).toEqual([["a", 0, 0.5], ["b", 0.5, 0.5], ["c", 1, 0.5]]);
    expect(uit.aantal).toBe(3);
  });

  it("om de twee slagen", () => {
    const uit = opDeMaat(metClips(foto("a", 0, 1.7), foto("b", 1.7, 2.2)), "s-beeld", slagen, 2);
    expect(beeld(uit.project)).toEqual([["a", 0, 1], ["b", 1, 1]]);
  });

  it("een video die te kort is eindigt op zijn eigen einde; de volgende pakt de eerstvolgende slag", () => {
    const kort = nieuweBeeldClip({ id: "v", soort: "video", spoor: "s-beeld", start: 0, duur: 0.7, bron: "/api/admin/video/bestand/vabc1234567890", inpunt: 0, bronDuur: 0.7 });
    const uit = opDeMaat(metClips(kort, foto("b", 0.7, 2)), "s-beeld", [0, 1, 2]);
    expect(beeld(uit.project)).toEqual([["v", 0, 0.7], ["b", 0.7, 0.3]]);
    expect(uit.aantal).toBe(1);
  });

  it("na de laatste slag houden clips hun lengte; zonder slagen of clips verandert er niets", () => {
    const uit = opDeMaat(metClips(foto("a", 0, 1), foto("b", 1, 2)), "s-beeld", [0, 0.5]);
    expect(beeld(uit.project)).toEqual([["a", 0, 0.5], ["b", 0.5, 2]]);
    const p = metClips(foto("a", 0, 1));
    expect(opDeMaat(p, "s-beeld", [1]).project).toBe(p);
    expect(opDeMaat(p, "s-overlay", slagen).aantal).toBe(0);
  });
});
