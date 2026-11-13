import { describe, expect, it } from "vitest";
import { karaokeWoord, knip, leegProject, nieuweTekstClip, schoonProject, snijBegin, type Project, type TekstClip } from "@/lib/video/model";
import { bestandIdUitBron, metSpraakOndertitels, ondertitelSpoor, spraakRegels, type GesprokenWoord } from "@/lib/video/spraak-ondertitels";

// Ondertitels uit spraak in de video-editor (13 nov 2026): de woorden met hun tijd uit onze eigen Whisper worden korte
// regels op de tijdlijn, precies waar de clip dat stuk bron laat horen, en elk woord licht op als het klinkt.

const w = (woord: string, start: number, eind: number): GesprokenWoord => ({ woord, start, eind });

describe("het bestand van een clip", () => {
  it("alleen een bestand van de editor zelf", () => {
    expect(bestandIdUitBron("/api/admin/video/bestand/vabc1234567890")).toBe("vabc1234567890");
    expect(bestandIdUitBron("/api/admin/video/bestand/vabc1234567890?t=1")).toBe("vabc1234567890");
    expect(bestandIdUitBron("/api/admin/video/bestand/../geheim")).toBeNull();
    expect(bestandIdUitBron("https://elders.example/api/admin/video/bestand/vabc1234567890")).toBeNull();
    expect(bestandIdUitBron("/stock/foto.webp")).toBeNull();
    expect(bestandIdUitBron("")).toBeNull();
  });
});

describe("van woorden naar regels op de tijdlijn", () => {
  // de clip staat op 10 s, begint 2 s in de bron en speelt op dubbele snelheid: bron 2..12 s = tijdlijn 10..15 s
  const clip = { start: 10, duur: 5, inpunt: 2, snelheid: 2 };
  const woorden = [w("Hallo", 1, 1.5), w("daar", 2.4, 2.8), w("hoe", 3, 3.4), w("gaat", 3.4, 3.8), w("het?", 4, 4.6), w("Goed", 6, 6.4), w("later", 20, 21)];

  it("rekent bron naar tijdlijn om, laat weg wat de clip niet laat horen, en begint een nieuwe regel na een vraagteken", () => {
    const regels = spraakRegels(woorden, clip);
    expect(regels.map((r) => r.tekst)).toEqual(["daar hoe gaat het?", "Goed"]);
    const [eerste, tweede] = regels;
    expect(eerste?.start).toBeCloseTo(10.2, 3);
    // na het laatste woord (11,3 s) nog even blijven staan, maar niet tot de volgende regel (12 s)
    expect((eerste?.start ?? 0) + (eerste?.duur ?? 0)).toBeCloseTo(11.55, 3);
    expect(eerste?.woordTijden).toEqual([0, 0.3, 0.5, 0.8]);
    expect(tweede?.start).toBeCloseTo(12, 3);
    // een regel van één woord staat er minstens 0,6 s
    expect(tweede?.duur).toBeCloseTo(0.6, 3);
    expect(tweede?.woordTijden).toEqual([0]);
  });

  it("een nieuwe regel na het maximum aantal woorden, na te veel tekens en na een stilte", () => {
    const zeven = ["een", "twee", "drie", "vier", "vijf", "zes", "zeven"].map((x, i) => w(x, i * 0.3, i * 0.3 + 0.25));
    expect(spraakRegels(zeven, { start: 0, duur: 10, inpunt: 0, snelheid: 1 }, { maxWoorden: 3 }).map((r) => r.tekst)).toEqual(["een twee drie", "vier vijf zes", "zeven"]);
    const lang = [w("ontzettend", 0, 0.5), w("langgerekte", 0.5, 1), w("woorden", 1, 1.4)];
    expect(spraakRegels(lang, { start: 0, duur: 5, inpunt: 0, snelheid: 1 }, { maxTekens: 22 }).map((r) => r.tekst)).toEqual(["ontzettend langgerekte", "woorden"]);
    const stilte = [w("eerst", 0, 0.4), w("dan", 1.5, 1.8)];
    expect(spraakRegels(stilte, { start: 0, duur: 5, inpunt: 0, snelheid: 1 }).map((r) => r.tekst)).toEqual(["eerst", "dan"]);
  });

  it("een woord over het einde van de clip heen wordt afgekapt, nooit erbuiten", () => {
    const [regel] = spraakRegels([w("lang", 1.8, 2.5)], { start: 0, duur: 2, inpunt: 0, snelheid: 1 });
    expect(regel?.start).toBeCloseTo(1.8, 3);
    expect((regel?.start ?? 0) + (regel?.duur ?? 0)).toBeLessThanOrEqual(2.0001);
  });

  it("geen woorden of alleen lege woorden: geen regels", () => {
    expect(spraakRegels([], { start: 0, duur: 3, inpunt: 0, snelheid: 1 })).toEqual([]);
    expect(spraakRegels([w("  ", 0, 1)], { start: 0, duur: 3, inpunt: 0, snelheid: 1 })).toEqual([]);
  });
});

describe("op het ondertitelspoor zetten", () => {
  const met = (p: Project, clips: TekstClip[]): Project => ({ ...p, clips: [...p.clips, ...clips] });

  it("vervangt wat er binnen het bereik van de clip stond, laat de rest staan, in karaoke met de woordtijden", () => {
    const leeg = leegProject("Proef", "9:16");
    const p = met(leeg, [
      nieuweTekstClip({ id: "oud-binnen", spoor: "s-onder", start: 0, duur: 2, tekst: "oud" }),
      nieuweTekstClip({ id: "oud-buiten", spoor: "s-onder", start: 5, duur: 1, tekst: "blijft" }),
      nieuweTekstClip({ id: "titel", spoor: "s-tekst", start: 1, duur: 2, tekst: "titel" }),
    ]);
    const uit = metSpraakOndertitels(p, "s-onder", { start: 1, duur: 3 }, [
      { tekst: "nieuwe regel", start: 1.2, duur: 1, woordTijden: [0, 0.4] },
      { tekst: "zonder tijden", start: 2.5, duur: 1, woordTijden: [] },
    ]);
    const ids = uit.clips.map((c) => c.id);
    expect(ids).not.toContain("oud-binnen");
    expect(ids).toContain("oud-buiten");
    expect(ids).toContain("titel");
    const nieuw = uit.clips.filter((c): c is TekstClip => c.soort === "tekst" && c.spoor === "s-onder" && c.id !== "oud-buiten");
    expect(nieuw.map((c) => c.tekst)).toEqual(["nieuwe regel", "zonder tijden"]);
    expect(nieuw[0]).toMatchObject({ karaoke: true, stijl: "kader", grootte: 56, y: 0.76, woordTijden: [0, 0.4] });
    expect(nieuw[1] && "woordTijden" in nieuw[1]).toBe(false);
  });

  it("liggend beeld: kleinere letters, lager in beeld", () => {
    const uit = metSpraakOndertitels(leegProject("Proef", "16:9"), "s-onder", { start: 0, duur: 2 }, [{ tekst: "hallo", start: 0, duur: 1, woordTijden: [0] }]);
    expect(uit.clips[0]).toMatchObject({ grootte: 38, y: 0.84 });
  });

  it("het spoor: Ondertiteling, anders het eerste tekstspoor, anders geen", () => {
    const p = leegProject();
    expect(ondertitelSpoor(p)).toBe("s-onder");
    expect(ondertitelSpoor({ sporen: p.sporen.filter((s) => s.id !== "s-onder") })).toBe("s-tekst");
    expect(ondertitelSpoor({ sporen: p.sporen.filter((s) => s.soort !== "tekst") })).toBeNull();
  });
});

describe("karaoke op de stem", () => {
  const regel = nieuweTekstClip({ spoor: "s-onder", start: 10, duur: 2, tekst: "een twee drie", karaoke: true, woordTijden: [0, 0.2, 1.5] });

  it("met woordtijden licht het woord op dat nu klinkt, niet gelijk verdeeld", () => {
    expect(karaokeWoord(regel, 10.1)).toBe(0);
    expect(karaokeWoord(regel, 10.3)).toBe(1);
    // gelijk verdeeld zou hier al het derde woord zijn
    expect(karaokeWoord(regel, 11.4)).toBe(1);
    expect(karaokeWoord(regel, 11.6)).toBe(2);
  });

  it("zonder woordtijden, of als het aantal niet klopt: gelijk verdeeld over de clip", () => {
    const zonder = nieuweTekstClip({ spoor: "s-onder", start: 10, duur: 2, tekst: "een twee drie", karaoke: true });
    expect(karaokeWoord(zonder, 11.4)).toBe(2);
    expect(karaokeWoord({ ...regel, woordTijden: [0, 1] }, 11.4)).toBe(2);
    expect(karaokeWoord({ ...regel, tekst: "" }, 10.5)).toBe(-1);
  });

  it("knippen en het begin verschuiven houden de woorden op hun plek in de tijd", () => {
    const delen = knip(regel, 11);
    const tweede = delen?.[1] as TekstClip | undefined;
    expect(tweede?.start).toBe(11);
    expect(tweede?.woordTijden).toEqual([-1, -0.8, 0.5]);
    expect(karaokeWoord(tweede as TekstClip, 11.6)).toBe(2);
    expect((delen?.[0] as TekstClip | undefined)?.woordTijden).toEqual([0, 0.2, 1.5]);
    const later = snijBegin(regel, 10.5) as TekstClip;
    expect(later.woordTijden).toEqual([-0.5, -0.3, 1]);
    expect(karaokeWoord(later, 11.2)).toBe(1);
  });
});

describe("opslaan en laden", () => {
  const project = (woordTijden: unknown) => ({
    ...leegProject(),
    clips: [{ ...nieuweTekstClip({ spoor: "s-onder", start: 1, duur: 2, tekst: "a b c", karaoke: true }), woordTijden }],
  });

  it("goede woordtijden blijven bewaard", () => {
    const [clip] = schoonProject(project([0, 0.3, 0.9])).clips;
    expect(clip).toMatchObject({ soort: "tekst", woordTijden: [0, 0.3, 0.9] });
  });

  it("verkeerde woordtijden vallen weg (dan karaoke gelijkmatig): aflopend, verkeerd aantal, geen getal", () => {
    for (const fout of [[0.5, 0.2, 0.9], [0, 0.3], [0, "x", 1], "0,1,2", [0, Number.NaN, 1]]) {
      const [clip] = schoonProject(project(fout)).clips;
      expect(clip && "woordTijden" in clip, JSON.stringify(fout)).toBe(false);
    }
  });
});
