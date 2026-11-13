import { describe, expect, it } from "vitest";
import {
  alleSleutelbeeldenWeg,
  knip,
  leegProject,
  metSleutelbeeld,
  nieuweBeeldClip,
  schoonProject,
  sleutelbeeldOp,
  snijBegin,
  standOp,
  zetStand,
  zonderSleutelbeeld,
  type BeeldClip,
} from "@/lib/video/model";
import { knipStiltesWeg } from "@/lib/video/stiltes";

// Sleutelbeelden in de video-editor (13 nov 2026): plek, grootte, draaiing en zichtbaarheid van een beeldclip op een
// moment; ertussen loopt de stand vloeiend over. Knippen, bijsnijden en stiltes weghalen houden ze op hun moment.

const foto = (deel: Partial<BeeldClip> = {}) => nieuweBeeldClip({ id: "f", soort: "foto", spoor: "s-beeld", start: 10, duur: 4, bron: "/stock/a.webp", beweging: "geen", ...deel });
const k = (t: number, x: number, schaal = 1, dekking = 1) => ({ t, x, y: 0, schaal, draai: 0, dekking });

describe("de stand op een moment", () => {
  it("zonder sleutelbeelden: de vaste waarden van de clip", () => {
    const c = foto({ plaatsing: { x: 0.2, y: -0.1, schaal: 1.5, draai: 10 }, dekking: 0.8 });
    expect(standOp(c, 11)).toEqual({ plaatsing: { x: 0.2, y: -0.1, schaal: 1.5, draai: 10 }, dekking: 0.8 });
  });

  it("vloeiend tussen twee sleutelbeelden (zacht in en uit), en vóór het eerste en na het laatste vast", () => {
    const c = foto({ sleutelbeelden: [k(0, 0, 1, 1), k(2, 1, 2, 0)] });
    expect(standOp(c, 11)).toEqual({ plaatsing: { x: 0.5, y: 0, schaal: 1.5, draai: 0 }, dekking: 0.5 });
    // een kwart van de weg is zacht: minder dan een kwart van de beweging
    expect(standOp(c, 10.5).plaatsing.x).toBeCloseTo(0.15625, 5);
    expect(standOp(c, 9).plaatsing.x).toBe(0);
    expect(standOp(c, 13.5)).toEqual({ plaatsing: { x: 1, y: 0, schaal: 2, draai: 0 }, dekking: 0 });
  });
});

describe("sleutelbeelden zetten en weghalen", () => {
  it("het eerste sleutelbeeld neemt de vaste stand over; op dezelfde plek wordt het bijgewerkt, niet verdubbeld", () => {
    const c = foto({ plaatsing: { x: 0.3, y: 0, schaal: 1.2, draai: 0 } });
    const een = metSleutelbeeld(c, 11);
    expect(een.sleutelbeelden).toEqual([{ t: 1, x: 0.3, y: 0, schaal: 1.2, draai: 0, dekking: 1 }]);
    const twee = metSleutelbeeld(een, 11.005, { x: -0.5 });
    expect(twee.sleutelbeelden).toHaveLength(1);
    expect(twee.sleutelbeelden?.[0]?.x).toBe(-0.5);
    expect(sleutelbeeldOp(twee, 11)).not.toBeNull();
    expect(sleutelbeeldOp(twee, 11.5)).toBeNull();
  });

  it("buiten de clip komt het sleutelbeeld op de rand; ze staan altijd op volgorde", () => {
    const c = metSleutelbeeld(metSleutelbeeld(foto(), 20, { x: 1 }), 5, { x: -1 });
    expect(c.sleutelbeelden?.map((s) => s.t)).toEqual([0, 4]);
  });

  it("een schuifje: zonder sleutelbeelden voor de hele clip, met sleutelbeelden alleen op de afspeelkop", () => {
    const vast = zetStand(foto(), 11, { schaal: 2 });
    expect(vast.plaatsing.schaal).toBe(2);
    expect(vast.sleutelbeelden).toBeUndefined();
    const bewegend = zetStand(metSleutelbeeld(foto(), 10), 13, { schaal: 2 });
    expect(bewegend.plaatsing.schaal).toBe(1);
    expect(bewegend.sleutelbeelden?.map((s) => [s.t, s.schaal])).toEqual([[0, 1], [3, 2]]);
  });

  it("het laatste sleutelbeeld weg: de clip houdt de stand van dat moment", () => {
    const c = foto({ sleutelbeelden: [k(0, 0), k(2, 1)] });
    expect(zonderSleutelbeeld(c, 12).sleutelbeelden).toEqual([k(0, 0)]);
    const leeg = zonderSleutelbeeld(zonderSleutelbeeld(c, 12), 10);
    expect(leeg.sleutelbeelden).toBeUndefined();
    expect(leeg.plaatsing.x).toBe(0);
    const alles = alleSleutelbeeldenWeg(c, 11);
    expect(alles.sleutelbeelden).toBeUndefined();
    expect(alles.plaatsing.x).toBe(0.5);
  });
});

describe("knippen, bijsnijden en stiltes weghalen houden sleutelbeelden op hun moment", () => {
  const c = foto({ sleutelbeelden: [k(0, 0), k(3, 1)] });

  it("knippen: de tweede helft telt vanaf zijn eigen begin, en ziet er op de knip hetzelfde uit", () => {
    const [a, b] = knip(c, 11) as [BeeldClip, BeeldClip];
    expect(a.sleutelbeelden).toEqual([k(0, 0), k(3, 1)]);
    expect(b.sleutelbeelden).toEqual([k(-1, 0), k(2, 1)]);
    expect(standOp(b, 11).plaatsing.x).toBeCloseTo(standOp(c, 11).plaatsing.x, 6);
  });

  it("het begin verschuiven", () => {
    const later = snijBegin(c, 11.5) as BeeldClip;
    expect(later.sleutelbeelden).toEqual([k(-1.5, 0), k(1.5, 1)]);
    expect(standOp(later, 12).plaatsing.x).toBeCloseTo(standOp(c, 12).plaatsing.x, 6);
  });

  it("stiltes weghalen: een sleutelbeeld schuift mee naar zijn nieuwe moment", () => {
    const video = nieuweBeeldClip({ id: "v", soort: "video", spoor: "s-beeld", start: 0, duur: 10, bron: "/api/admin/video/bestand/vabc1234567890", inpunt: 0, bronDuur: 60, sleutelbeelden: [k(5, 1)] });
    const uit = knipStiltesWeg({ ...leegProject(), clips: [video] }, "v", [{ van: 0, tot: 2 }, { van: 4, tot: 6 }]);
    const delen = uit.project.clips.filter((x): x is BeeldClip => x.soort === "video").sort((a, b) => a.start - b.start);
    // 5 s in de bron zit nu op 3 s: 1 s in het tweede stuk
    expect(delen[1]?.sleutelbeelden?.[0]?.t).toBe(1);
    expect(delen[0]?.sleutelbeelden?.[0]?.t).toBe(3);
  });
});

describe("opslaan en laden", () => {
  it("bewaart sleutelbeelden begrensd en op volgorde; onbruikbare vallen weg", () => {
    const project = { ...leegProject(), clips: [{ ...foto(), sleutelbeelden: [{ t: 2, x: 9, y: 0, schaal: 0, draai: 720, dekking: 3 }, { t: 0, x: 0.1 }, { t: "x" }, null] }] };
    const [clip] = schoonProject(project).clips as BeeldClip[];
    expect(clip?.sleutelbeelden).toEqual([
      { t: 0, x: 0.1, y: 0, schaal: 1, draai: 0, dekking: 1 },
      { t: 2, x: 2, y: 0, schaal: 0.05, draai: 360, dekking: 1 },
    ]);
  });

  it("geen of alleen onbruikbare sleutelbeelden: geen veld", () => {
    for (const ruw of [[], [{ t: "x" }], "nee"]) {
      const [clip] = schoonProject({ ...leegProject(), clips: [{ ...foto(), sleutelbeelden: ruw }] }).clips;
      expect(clip && "sleutelbeelden" in clip, JSON.stringify(ruw)).toBe(false);
    }
  });
});
