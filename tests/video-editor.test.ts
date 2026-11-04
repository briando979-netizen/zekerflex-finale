import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  bewegingOp,
  dupliceer,
  einde,
  knip,
  leegProject,
  magneet,
  muziekDemping,
  nieuweAudioClip,
  nieuweBeeldClip,
  nieuweTekstClip,
  ondertitels,
  projectDuur,
  schoonProject,
  snijBegin,
  snijEinde,
  tekstAnimatie,
  verwijderClip,
  vervaagFactor,
  vrijePlek,
  zetSnelheid,
  type BeeldClip,
} from "@/lib/video/model";
import { bouwAutoProject, schoonScenario, standaardScenario } from "@/lib/video/auto-bouw";
import { pcmNaarWav, wavDuur } from "@/lib/video/wav";
import { herken } from "@/lib/video/bestanden";
import { kiesStockFoto, STOCK_FOTOS } from "@/lib/video/stock";

const video = (deel: Partial<BeeldClip> = {}) => nieuweBeeldClip({ spoor: "s-beeld", soort: "video", start: 2, duur: 4, bron: "/api/admin/video/bestand/vabc1234567890", bronDuur: 10, inpunt: 1, ...deel });

describe("video-editor: knippen en bijsnijden", () => {
  it("knipt een video in twee en schuift het inpunt van het tweede deel mee", () => {
    const delen = knip(video(), 3.5);
    expect(delen).not.toBeNull();
    const [a, b] = delen!;
    expect(a.start).toBe(2);
    expect(a.duur).toBe(1.5);
    expect(b.start).toBe(3.5);
    expect(b.duur).toBe(2.5);
    expect(b.soort === "video" && b.inpunt).toBe(2.5);
    expect(b.id).not.toBe(a.id);
  });

  it("knipt niet op de rand van een clip", () => {
    expect(knip(video(), 2)).toBeNull();
    expect(knip(video(), 6)).toBeNull();
  });

  it("houdt rekening met de snelheid bij knippen", () => {
    const [, b] = knip(video({ snelheid: 2 }), 3)!;
    expect(b.soort === "video" && b.inpunt).toBe(3); // 1 + 1 s × 2
  });

  it("linkerrand slepen verschuift het inpunt maar niet voorbij het begin van de bron", () => {
    const c = snijBegin(video(), 0);
    expect(c.start).toBe(1); // inpunt 1 s → hooguit 1 s terug
    expect(c.soort === "video" && c.inpunt).toBe(0);
    expect(einde(c)).toBe(6);
  });

  it("rechterrand slepen kan niet langer dan de bron", () => {
    const c = snijEinde(video(), 100);
    expect(c.duur).toBe(9); // bron 10 s, inpunt 1 s
  });

  it("een foto mag je eindeloos langer maken", () => {
    const foto = nieuweBeeldClip({ spoor: "s-beeld", soort: "foto", start: 0, duur: 3 });
    expect(snijEinde(foto, 40).duur).toBe(40);
  });

  it("sneller afspelen maakt de clip korter, met hetzelfde stuk bron", () => {
    const c = zetSnelheid(video(), 2);
    expect(c.duur).toBe(2);
    expect(c.snelheid).toBe(2);
  });
});

describe("video-editor: plaatsen op de tijdlijn", () => {
  const p = { ...leegProject(), clips: [video({ start: 0, duur: 4 }), video({ start: 6, duur: 2 })] };

  it("vindt een vrije plek zonder overlap op hetzelfde spoor", () => {
    expect(vrijePlek(p, "s-beeld", 2, 4)).toBe(4); // past precies in het gat
    expect(vrijePlek(p, "s-beeld", 3, 5)).toBe(8); // past niet in het gat: erachter
    expect(vrijePlek(p, "s-overlay", 3, 1)).toBe(1); // ander spoor is vrij
  });

  it("de magneet klikt binnen de drempel aan een rand", () => {
    expect(magneet(3.93, [0, 4, 6], 0.1)).toBe(4);
    expect(magneet(3.5, [0, 4, 6], 0.1)).toBe(3.5);
  });

  it("verwijderen op het hoofdspoor schuift de rest aan", () => {
    const eerste = p.clips[0]!;
    const na = verwijderClip(p, eerste.id, true);
    expect(na.clips).toHaveLength(1);
    expect(na.clips[0]!.start).toBe(2);
  });

  it("dupliceren zet de kopie op een vrije plek erachter", () => {
    const { project, kopie } = dupliceer(p, p.clips[0]!.id);
    expect(kopie).not.toBeNull();
    expect(project.clips).toHaveLength(3);
    expect(kopie!.start).toBe(8);
  });

  it("projectduur is het einde van de laatste clip", () => {
    expect(projectDuur(p)).toBe(8);
    expect(projectDuur(leegProject())).toBe(1);
  });
});

describe("video-editor: effecten", () => {
  it("vervagen in en uit", () => {
    const c = { start: 0, duur: 4, vervagenIn: 1, vervagenUit: 1 };
    expect(vervaagFactor(c, 0)).toBe(0);
    expect(vervaagFactor(c, 0.5)).toBeCloseTo(0.5);
    expect(vervaagFactor(c, 2)).toBe(1);
    expect(vervaagFactor(c, 3.5)).toBeCloseTo(0.5);
  });

  it("Ken Burns zoomt geleidelijk in", () => {
    expect(bewegingOp("inzoomen", 0).schaal).toBe(1);
    expect(bewegingOp("inzoomen", 1).schaal).toBeCloseTo(1.14);
    expect(bewegingOp("geen", 0.5)).toEqual({ schaal: 1, dx: 0, dy: 0 });
  });

  it("typen laat de tekst letter voor letter verschijnen", () => {
    const t = nieuweTekstClip({ spoor: "s-tekst", start: 0, duur: 4, tekst: "Hallo wereld", animatieIn: "typen" });
    expect(tekstAnimatie(t, 0).tekens).toBe(0);
    expect(tekstAnimatie(t, 3).tekens).toBe(12);
  });

  it("muziek gaat zachter zolang er een stem klinkt", () => {
    const p = { ...leegProject(), clips: [nieuweAudioClip({ spoor: "s-stem", start: 1, duur: 2, bron: "/x.wav", rol: "stem" })] };
    expect(muziekDemping(p, 2)).toBeLessThan(0.5);
    expect(muziekDemping(p, 5)).toBe(1);
  });

  it("ondertitels zijn kort en vullen samen de hele duur", () => {
    const regels = ondertitels("Wij zoeken vandaag nog collega's voor de bediening. Kom je ook?", 1, 6, 4);
    expect(regels.length).toBeGreaterThanOrEqual(3);
    for (const r of regels) expect(r.tekst.split(" ").length).toBeLessThanOrEqual(4);
    expect(regels[0]!.start).toBe(1);
    const laatste = regels[regels.length - 1]!;
    expect(laatste.start + laatste.duur).toBeCloseTo(7, 1);
  });
});

describe("video-editor: opslaan is veilig", () => {
  it("houdt alleen bronnen van onze eigen herkomst", () => {
    const p = leegProject();
    const ruw = {
      ...p,
      clips: [
        { ...nieuweBeeldClip({ spoor: "s-beeld", soort: "foto", start: 0, duur: 2 }), bron: "https://kwaad.example/x.jpg" },
        { ...nieuweBeeldClip({ spoor: "s-beeld", soort: "foto", start: 2, duur: 2 }), bron: "//kwaad.example/x.jpg" },
        { ...nieuweBeeldClip({ spoor: "s-beeld", soort: "foto", start: 4, duur: 2 }), bron: "javascript:alert(1)" },
        nieuweBeeldClip({ spoor: "s-beeld", soort: "foto", start: 6, duur: 2, bron: "/shifts/horeca.jpg" }),
      ],
    };
    const schoon = schoonProject(ruw);
    expect(schoon.clips.map((c) => (c.soort === "foto" ? c.bron : ""))).toEqual(["/shifts/horeca.jpg"]);
  });

  it("begrenst getallen en gooit onbekende velden weg", () => {
    const p = leegProject();
    const schoon = schoonProject({ ...p, clips: [{ ...nieuweTekstClip({ spoor: "s-tekst", start: -5, duur: 99999 }), grootte: 5000, kleur: "red", extra: "<script>" }] });
    const t = schoon.clips[0]!;
    expect(t.start).toBe(0);
    expect(t.duur).toBe(3600);
    expect(t.soort === "tekst" && t.grootte).toBe(300);
    expect(t.soort === "tekst" && t.kleur).toBe("#FFFFFF");
    expect("extra" in t).toBe(false);
  });

  it("weigert iets dat geen project is", () => {
    expect(() => schoonProject({ naam: "x" })).toThrow();
  });

  it("een clip op een spoor van de verkeerde soort valt weg", () => {
    const p = leegProject();
    const schoon = schoonProject({ ...p, clips: [nieuweTekstClip({ spoor: "s-beeld", start: 0, duur: 1 })] });
    expect(schoon.clips).toHaveLength(0);
  });
});

describe("AI-video: van scenario naar tijdlijn", () => {
  const scenario = standaardScenario("Bediening gezocht in Rotterdam", 4);

  it("zonder stem: elke scène een foto, een kop, ondertitels en een eindbeeld", () => {
    const p = bouwAutoProject(scenario, { formaat: "9:16", lengte: 20, beelden: scenario.scenes.map(() => "/shifts/horeca.jpg"), stem: null, ondertiteling: true });
    const fotos = p.clips.filter((c) => c.soort === "foto");
    expect(fotos).toHaveLength(scenario.scenes.length);
    expect(p.clips.some((c) => c.soort === "kleur")).toBe(true);
    expect(p.clips.filter((c) => c.spoor === "s-onder").length).toBeGreaterThan(0);
    expect(projectDuur(p)).toBeCloseTo(20, 0);
    // Geen overlap op het hoofdspoor.
    const hoofd = p.clips.filter((c) => c.spoor === "s-beeld").sort((a, b) => a.start - b.start);
    for (let i = 1; i < hoofd.length; i++) expect(hoofd[i]!.start).toBeGreaterThanOrEqual(einde(hoofd[i - 1]!) - 1e-6);
    // Het resultaat overleeft het schoonmaken bij opslaan.
    expect(schoonProject(p).clips).toHaveLength(p.clips.length);
  });

  it("met stem: de scènes duren samen zo lang als de stem", () => {
    const p = bouwAutoProject(scenario, { formaat: "16:9", lengte: 30, beelden: ["/shifts/horeca.jpg"], stem: { adres: "/api/admin/video/bestand/vabc1234567890", duur: 14 }, ondertiteling: false });
    const stem = p.clips.find((c) => c.soort === "audio");
    expect(stem?.duur).toBe(14);
    const fotos = p.clips.filter((c) => c.soort === "foto");
    const eindFotos = Math.max(...fotos.map(einde));
    expect(eindFotos).toBeGreaterThanOrEqual(14);
    expect(p.clips.some((c) => c.spoor === "s-onder")).toBe(false);
  });

  it("maakt AI-uitvoer veilig en weigert te weinig scènes", () => {
    expect(schoonScenario({ scenes: [{ kop: "x" }] }, 5)).toBeNull();
    const s = schoonScenario({ titel: "T", scenes: [{ kop: "a".repeat(300), voorlezen: "b" }, { kop: "c", voorlezen: "d", trefwoorden: ["horeca", 5] }] }, 5);
    expect(s?.scenes[0]?.kop.length).toBe(70);
    expect(s?.scenes[1]?.trefwoorden).toEqual(["horeca"]);
    expect(s?.slot.onder).toBe("zekerflex.com");
  });

  it("kiest een passende eigen foto en liever niet twee keer dezelfde", () => {
    expect(kiesStockFoto(["horeca", "restaurant"]).adres).toBe("/shifts/horeca.jpg");
    expect(kiesStockFoto(["horeca"], new Set(["/shifts/horeca.jpg"])).adres).not.toBe("/shifts/horeca.jpg");
    // Foto's met ingebakken tekst staan er niet in.
    expect(STOCK_FOTOS.some((f) => /employer-hero|auth-login/.test(f.adres))).toBe(false);
  });
});

describe("audio en bestanden", () => {
  it("zet PCM om naar WAV en leest de duur terug", () => {
    const pcm = Buffer.alloc(24000 * 2 * 3); // 3 s, 16-bit mono
    const wav = pcmNaarWav(pcm, 24000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wavDuur(wav)).toBeCloseTo(3);
    expect(wavDuur(Buffer.from("geen wav"))).toBeNull();
  });

  it("herkent bestanden aan de eerste bytes", () => {
    expect(herken(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.soort).toBe("foto");
    expect(herken(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(8)]))?.mime).toBe("video/mp4");
    expect(herken(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypM4A "), Buffer.alloc(8)]))?.soort).toBe("audio");
    expect(herken(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypavif"), Buffer.alloc(8)]))?.soort).toBe("foto");
    expect(herken(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm")?.soort).toBe("audio");
    expect(herken(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))?.soort).toBe("video");
    expect(herken(pcmNaarWav(Buffer.alloc(10)))?.mime).toBe("audio/wav");
    expect(herken(Buffer.from("ID3\u0003\u0000"))?.mime).toBe("audio/mpeg");
    expect(herken(Buffer.from("<svg xmlns="))).toBeNull();
    expect(herken(Buffer.from("<?php echo 1;"))).toBeNull();
  });
});
