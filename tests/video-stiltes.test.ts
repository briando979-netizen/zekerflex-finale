import { describe, expect, it } from "vitest";
import { leegProject, nieuweAudioClip, nieuweBeeldClip, nieuweTekstClip, type BeeldClip, type Project, type TekstClip } from "@/lib/video/model";
import { knipStiltesWeg, spraakStukken } from "@/lib/video/stiltes";
import type { GesprokenWoord } from "@/lib/video/spraak-ondertitels";

// Stiltes weghalen in de video-editor (13 nov 2026): op de woordtijden van onze eigen Whisper. Alleen de stukken met
// spraak blijven, direct achter elkaar; wat erna komt schuift naar voren en ondertitels schuiven mee met hun woord.

const w = (woord: string, start: number, eind: number): GesprokenWoord => ({ woord, start, eind });

describe("waar gesproken wordt", () => {
  it("woorden met een korte stilte ertussen horen bij één stuk; een lange stilte splitst; alles binnen de bron", () => {
    const stukken = spraakStukken([w("een", 10.5, 11), w("twee", 11.2, 11.8), w("drie", 14, 15), w("vier", 19.9, 20.5)], { van: 10, tot: 20 });
    expect(stukken).toEqual([
      { van: 10.38, tot: 11.92 },
      { van: 13.88, tot: 15.12 },
      { van: 19.78, tot: 20 },
    ]);
  });

  it("de grens voor een stilte is in te stellen, en woorden buiten de bron tellen niet", () => {
    const woorden = [w("a", 0, 0.5), w("b", 1.4, 2)];
    expect(spraakStukken(woorden, { van: 0, tot: 5 }, { minStilte: 1 })).toHaveLength(1);
    expect(spraakStukken(woorden, { van: 0, tot: 5 }, { minStilte: 0.4 })).toHaveLength(2);
    expect(spraakStukken([w("ver", 30, 31)], { van: 0, tot: 5 })).toEqual([]);
  });
});

describe("de stiltes eruit knippen", () => {
  // video op 2 s, uit de bron 10..20 s (normale snelheid); daarna nog een clip op hetzelfde spoor
  const video = nieuweBeeldClip({ id: "vid", soort: "video", spoor: "s-beeld", start: 2, duur: 10, bron: "/api/admin/video/bestand/vabc1234567890", inpunt: 10, bronDuur: 60, vervagenIn: 0.5, vervagenUit: 0.8, overgang: "vervagen" });
  const erna = nieuweBeeldClip({ id: "erna", soort: "foto", spoor: "s-beeld", start: 12, duur: 3, bron: "/stock/a.webp" });
  const muziek = nieuweAudioClip({ id: "muziek", spoor: "s-muziek", start: 0, duur: 20, bron: "/api/admin/video/bestand/vmuziek12345" });
  const ondertitelInSpraak = nieuweTekstClip({ id: "o1", spoor: "s-onder", start: 6, duur: 1, tekst: "drie vier", karaoke: true, woordTijden: [0, 0.5] });
  const ondertitelInStilte = nieuweTekstClip({ id: "o2", spoor: "s-onder", start: 4, duur: 0.5, tekst: "stil" });
  const basis: Project = { ...leegProject("Proef", "9:16"), clips: [video, erna, muziek, ondertitelInSpraak, ondertitelInStilte] };
  const stukken = spraakStukken([w("een", 10.5, 11), w("twee", 11.2, 11.8), w("drie", 14, 15), w("vier", 19.9, 20.5)], { van: 10, tot: 20 });

  const uit = knipStiltesWeg(basis, "vid", stukken);
  const clip = (id: string) => uit.project.clips.find((c) => c.id === id);
  const delen = uit.project.clips.filter((c): c is BeeldClip => c.spoor === "s-beeld" && c.soort === "video").sort((a, b) => a.start - b.start);

  it("alleen de spraak blijft, direct achter elkaar, met de juiste stukken bron", () => {
    expect(delen).toHaveLength(3);
    expect(delen.map((d) => d.start)).toEqual([2, 3.54, 4.78]);
    expect(delen.map((d) => d.inpunt)).toEqual([10.38, 13.88, 19.78]);
    expect(delen.map((d) => d.duur)).toEqual([1.54, 1.24, 0.22]);
    // de eerste houdt het id (de selectie blijft staan), de rest is nieuw
    expect(delen[0]?.id).toBe("vid");
    expect(new Set(delen.map((d) => d.id)).size).toBe(3);
    expect(uit.weg).toBeCloseTo(7, 3);
    // aan het begin, en twee tussen de stukken; het einde loopt tot de rand van de clip
    expect(uit.stiltes).toBe(3);
  });

  it("vagen en de overgang alleen aan de echte randen", () => {
    expect(delen[0]).toMatchObject({ vervagenIn: 0.5, vervagenUit: 0, overgang: "vervagen" });
    expect(delen[1]).toMatchObject({ vervagenIn: 0, vervagenUit: 0, overgang: "geen" });
    expect(delen[2]).toMatchObject({ vervagenIn: 0, vervagenUit: 0.8 });
  });

  it("wat erna komt schuift naar voren; wat ervoor begint blijft staan", () => {
    expect(clip("erna")?.start).toBeCloseTo(5, 3);
    expect(clip("muziek")?.start).toBe(0);
  });

  it("ondertitels schuiven mee met hun woord; één in een weggehaalde stilte gaat naar het begin van het volgende stuk", () => {
    const o1 = clip("o1") as TekstClip | undefined;
    // 6 s op de tijdlijn = 14 s in de bron = 0,12 s in het tweede stuk
    expect(o1?.start).toBeCloseTo(3.66, 3);
    expect(o1?.duur).toBeCloseTo(1, 3);
    expect(o1?.woordTijden).toEqual([0, 0.5]);
    expect(clip("o2")?.start).toBeCloseTo(3.54, 3);
  });

  it("niets te doen: geen stukken, een onbekende clip, een foto, of geen winst", () => {
    expect(knipStiltesWeg(basis, "vid", []).project).toBe(basis);
    expect(knipStiltesWeg(basis, "bestaat-niet", stukken).weg).toBe(0);
    expect(knipStiltesWeg(basis, "erna", stukken).weg).toBe(0);
    expect(knipStiltesWeg(basis, "vid", [{ van: 10, tot: 20 }]).weg).toBe(0);
  });

  it("op dubbele snelheid telt de tijdlijn de helft", () => {
    const snel = nieuweBeeldClip({ id: "snel", soort: "video", spoor: "s-beeld", start: 0, duur: 5, bron: "/api/admin/video/bestand/vabc1234567890", inpunt: 0, bronDuur: 60, snelheid: 2 });
    const r = knipStiltesWeg({ ...leegProject(), clips: [snel] }, "snel", [{ van: 0, tot: 2 }, { van: 6, tot: 8 }]);
    expect(r.project.clips.map((c) => c.duur)).toEqual([1, 1]);
    expect(r.weg).toBeCloseTo(3, 3);
  });
});
