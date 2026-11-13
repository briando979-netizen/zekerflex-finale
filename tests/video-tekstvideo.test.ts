import { describe, expect, it } from "vitest";

import {
  einde,
  leegProject,
  mengKleur,
  nieuweBeeldClip,
  nieuweTekstClip,
  projectDuur,
  schoonProject,
  tekstAnimatie,
  toeval,
  zaad,
  zichtbareRegels,
  type Clip,
  type TekstClip,
} from "@/lib/video/model";
import { TEKSTVIDEO_VOORBEELD, bouwTekstVideo, tekstVideoRegels, verdeelRegels } from "@/lib/video/tekst-video";
import { TEKST_PRESETS } from "@/components/admin/video/presets";

const tekst = (deel: Partial<TekstClip> = {}) => nieuweTekstClip({ spoor: "s-tekst", start: 0, duur: 4, ...deel });

describe("video-editor: nieuwe tekststijlen en animaties bij opslaan", () => {
  it("houdt chatbubbels, venster, 3D, woord voor woord en glitch", () => {
    const p = leegProject();
    const ruw = {
      ...p,
      clips: [
        tekst({ stijl: "bubbel-blauw", animatieIn: "woorden", animatieUit: "glitch" }),
        tekst({ start: 4, stijl: "bubbel-groen", animatieIn: "glitch" }),
        tekst({ start: 8, stijl: "venster", animatieIn: "typen" }),
        tekst({ start: 12, stijl: "3d" }),
        nieuweBeeldClip({ spoor: "s-beeld", soort: "kleur", start: 0, duur: 2 }),
        nieuweBeeldClip({ spoor: "s-beeld", soort: "kleur", start: 2, duur: 2, overgang: "glitch" }),
      ],
    };
    const schoon = schoonProject(ruw);
    const teksten = schoon.clips.filter((c): c is TekstClip => c.soort === "tekst");
    expect(teksten.map((c) => c.stijl)).toEqual(["bubbel-blauw", "bubbel-groen", "venster", "3d"]);
    expect(teksten[0]?.animatieIn).toBe("woorden");
    expect(teksten[0]?.animatieUit).toBe("glitch");
    expect(teksten[1]?.animatieIn).toBe("glitch");
    const kleur = schoon.clips.filter((c) => c.soort === "kleur");
    expect(kleur.map((c) => (c.soort === "kleur" ? c.overgang : ""))).toEqual(["geen", "glitch"]);
  });

  it("weigert nog steeds onbekende waarden", () => {
    const p = leegProject();
    const schoon = schoonProject({
      ...p,
      clips: [
        { ...tekst(), stijl: "bubbel-rood", animatieIn: "explosie", animatieUit: "glitchy" },
        { ...nieuweBeeldClip({ spoor: "s-beeld", soort: "kleur", start: 0, duur: 2 }), overgang: "flits" },
      ],
    });
    const t = schoon.clips.find((c): c is TekstClip => c.soort === "tekst");
    expect(t?.stijl).toBe("schaduw");
    expect(t?.animatieIn).toBe("pop");
    expect(t?.animatieUit).toBe("vervagen");
    const k = schoon.clips.find((c) => c.soort === "kleur");
    expect(k?.soort === "kleur" && k.overgang).toBe("geen");
  });

  it("een oud project blijft precies zoals het was", () => {
    const p = leegProject();
    const oud = { ...p, clips: [tekst({ stijl: "neon", animatieIn: "stuiteren", animatieUit: "pop" }), nieuweBeeldClip({ spoor: "s-beeld", soort: "kleur", start: 0, duur: 2, overgang: "draaien" })] };
    const schoon = schoonProject(oud);
    expect(schoon.clips).toEqual(oud.clips);
  });

  it("de nieuwe kant-en-klare tekststijlen overleven het opslaan", () => {
    const p = leegProject();
    const clips = TEKST_PRESETS.map((x, i) => tekst({ start: i * 4, ...x.instelling }));
    const schoon = schoonProject({ ...p, clips });
    expect(schoon.clips).toEqual(clips);
  });
});

describe("video-editor: woord voor woord en glitch", () => {
  it("laat de woorden een voor een verschijnen en eindigt met alles", () => {
    const c = tekst({ tekst: "Kies je eigen klussen", animatieIn: "woorden" });
    expect(tekstAnimatie(c, 0).woorden).toBe(0);
    const half = tekstAnimatie(c, 0.64).woorden; // 4 woorden × 0,32 s → halverwege
    expect(half).toBeGreaterThan(1.5);
    expect(half).toBeLessThan(2.5);
    expect(tekstAnimatie(c, 3).woorden).toBe(4);
    // Zonder deze animatie staan alle woorden er meteen.
    expect(tekstAnimatie(tekst({ tekst: "Kies je eigen klussen", animatieIn: "pop" }), 0).woorden).toBe(4);
  });

  it("verdeelt zichtbare woorden over afgebroken regels, met het woord dat binnenkomt apart", () => {
    const c = { animatieIn: "woorden" as const, tekst: "Werk zoeken? Kies je klussen" };
    const regels = ["Werk zoeken?", "Kies je klussen"];
    const r = zichtbareRegels(regels, c, { tekens: 0, woorden: 3.2 });
    expect(r[0]).toEqual({ vol: "Werk zoeken?", nieuw: "", f: 0 });
    expect(r[1]?.vol).toBe("Kies");
    expect(r[1]?.nieuw).toBe("je");
    expect(r[1]?.f).toBeCloseTo(0.5);
    expect(zichtbareRegels(regels, c, { tekens: 0, woorden: 5 }).map((x) => x.vol)).toEqual(regels);
    expect(zichtbareRegels(regels, c, { tekens: 0, woorden: 0 }).map((x) => x.vol + x.nieuw)).toEqual(["", ""]);
  });

  it("typen telt tekens over de regels heen (regel voor regel)", () => {
    const c = { animatieIn: "typen" as const, tekst: "Kies je klus.\nUren in de app." };
    const r = zichtbareRegels(["Kies je klus.", "Uren in de app."], c, { tekens: 18, woorden: 7 });
    expect(r.map((x) => x.vol)).toEqual(["Kies je klus.", "Uren"]);
  });

  it("glitcht hard bij binnenkomen en weggaan, en is rustig in het midden", () => {
    const c = tekst({ id: "c-glitch-test", animatieIn: "glitch", animatieUit: "glitch", duur: 3 });
    expect(tekstAnimatie(c, 0.01).glitch).toBeGreaterThan(0.9);
    expect(tekstAnimatie(c, 1.5).glitch).toBe(0);
    expect(tekstAnimatie(c, 1.5).dekking).toBe(1);
    expect(tekstAnimatie(c, 2.99).glitch).toBeGreaterThan(0.9);
    // Zonder glitch-animatie nooit glitch.
    expect(tekstAnimatie(tekst(), 0.01).glitch).toBe(0);
  });

  it("is voorspelbaar: zelfde clip en tijd geven hetzelfde beeld", () => {
    const c = tekst({ id: "c-vast", animatieIn: "glitch", animatieUit: "glitch" });
    for (const t of [0.02, 0.07, 0.13, 3.8, 3.95]) expect(tekstAnimatie(c, t)).toEqual(tekstAnimatie(c, t));
  });

  it("schijntoeval hangt alleen af van zaad en volgnummer", () => {
    const z = zaad("c-abc");
    expect(zaad("c-abc")).toBe(z);
    expect(zaad("c-abd")).not.toBe(z);
    const reeks = Array.from({ length: 400 }, (_, i) => toeval(z, i));
    expect(reeks).toEqual(Array.from({ length: 400 }, (_, i) => toeval(z, i)));
    expect(Math.min(...reeks)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...reeks)).toBeLessThan(1);
    // Ruwweg gelijk verdeeld.
    const gem = reeks.reduce((a, b) => a + b, 0) / reeks.length;
    expect(gem).toBeGreaterThan(0.4);
    expect(gem).toBeLessThan(0.6);
  });

  it("mengt kleuren voor het verloop en de diepte van 3D", () => {
    expect(mengKleur("#FFFFFF", "#000000", 0.5)).toBe("#808080");
    expect(mengKleur("#1E86FF", "#000000", 0)).toBe("#1e86ff");
    expect(mengKleur("rood", "#000000", 0)).toBe("#808080");
  });
});

describe("Tekstvideo in één klik", () => {
  const tekstClips = (clips: Clip[]) => clips.filter((c): c is TekstClip => c.soort === "tekst");

  it("leest regels uit het tekstvak: zonder lege regels en begrensd", () => {
    expect(tekstVideoRegels("  Werk zoeken? \n\n  Kies   je klus\r\nZekerFlex\n")).toEqual(["Werk zoeken?", "Kies je klus", "ZekerFlex"]);
    expect(tekstVideoRegels(Array.from({ length: 30 }, (_, i) => `regel ${i}`).join("\n"))).toHaveLength(12);
    expect(tekstVideoRegels("a".repeat(500))[0]).toHaveLength(90);
  });

  it("verdeelt de regels: bubbels, één 3D-woord, venster en eindbeeld", () => {
    const d = verdeelRegels(TEKSTVIDEO_VOORBEELD);
    expect(d.bubbels).toEqual(["Werk zoeken?", "Kies je eigen klussen", "Werk wanneer het jou past"]);
    expect(d.woord).toBe("FLEX");
    expect(d.venster).toEqual(["Reageer in één tik.", "Uren schrijven in de app."]);
    expect(d.eind).toBe("ZekerFlex");
    // Geen regel van één woord: het langste woord, zonder leestekens.
    expect(verdeelRegels(["Werk zoeken?", "Snel personeel", "ZekerFlex"]).woord).toBe("PERSONEEL");
    // Niets ingevuld: het voorbeeld.
    expect(verdeelRegels([]).woord).toBe("FLEX");
  });

  it("bouwt de hele video zoals het voorbeeld: bubbels om en om, 3D met glitch, venster met typen, eindbeeld", () => {
    const p = bouwTekstVideo({ regels: TEKSTVIDEO_VOORBEELD, formaat: "9:16", lengte: 15 });
    const teksten = tekstClips(p.clips).filter((c) => c.spoor === "s-tekst").sort((a, b) => a.start - b.start);
    const bubbels = teksten.filter((c) => c.stijl.startsWith("bubbel"));
    expect(bubbels.map((c) => c.stijl)).toEqual(["bubbel-blauw", "bubbel-groen", "bubbel-blauw"]);
    for (const b of bubbels) expect(b.animatieIn).toBe("woorden");
    const drie = teksten.filter((c) => c.stijl === "3d");
    expect(drie).toHaveLength(1);
    expect(drie[0]?.tekst).toBe("FLEX");
    expect(drie[0]?.animatieIn).toBe("glitch");
    const venster = teksten.find((c) => c.stijl === "venster");
    expect(venster?.animatieIn).toBe("typen");
    expect(venster?.tekst).toBe("Reageer in één tik.\nUren schrijven in de app.");
    // Volgorde zoals in de video: bubbels, 3D, venster, eindtitel.
    expect(teksten.map((c) => c.stijl)).toEqual(["bubbel-blauw", "bubbel-groen", "bubbel-blauw", "3d", "venster", "schaduw"]);
    expect(teksten[teksten.length - 1]?.tekst).toBe("ZekerFlex");

    // Donkere achtergrond per deel, met een glitch-overgang vanaf het tweede deel.
    const achter = p.clips.filter((c) => c.spoor === "s-beeld").sort((a, b) => a.start - b.start);
    expect(achter.every((c) => c.soort === "kleur")).toBe(true);
    expect(achter.map((c) => (c.soort === "kleur" ? c.overgang : ""))).toEqual(["geen", "glitch", "glitch", "glitch"]);
    // Aansluitend, zodat de overgang ook echt speelt.
    for (let i = 1; i < achter.length; i++) expect(achter[i]!.start).toBeCloseTo(einde(achter[i - 1]!), 2);
    // Eindbeeld met het eigen logo als hoes.
    expect(p.clips.some((c) => c.soort === "foto" && c.bron === "/icons/icon-512.png")).toBe(true);
    expect(projectDuur(p)).toBeCloseTo(15, 0);
  });

  it("geen overlap op de sporen en alles overleeft het opslaan", () => {
    const p = bouwTekstVideo({ regels: TEKSTVIDEO_VOORBEELD, formaat: "9:16", lengte: 20 });
    for (const spoor of ["s-beeld", "s-tekst", "s-overlay", "s-onder"]) {
      const op = p.clips.filter((c) => c.spoor === spoor).sort((a, b) => a.start - b.start);
      for (let i = 1; i < op.length; i++) expect(op[i]!.start).toBeGreaterThanOrEqual(einde(op[i - 1]!) - 1e-6);
    }
    const schoon = schoonProject(p);
    expect(schoon.clips).toEqual(p.clips);
  });

  it("past de lengte en het formaat aan", () => {
    for (const lengte of [10, 15, 20, 30]) expect(projectDuur(bouwTekstVideo({ regels: TEKSTVIDEO_VOORBEELD, formaat: "9:16", lengte }))).toBeCloseTo(lengte, 0);
    const staand = bouwTekstVideo({ regels: TEKSTVIDEO_VOORBEELD, formaat: "9:16", lengte: 15 });
    const liggend = bouwTekstVideo({ regels: TEKSTVIDEO_VOORBEELD, formaat: "16:9", lengte: 15 });
    expect(liggend.formaat).toBe("16:9");
    const grootte = (p: typeof staand) => tekstClips(p.clips).find((c) => c.stijl === "bubbel-blauw")?.grootte ?? 0;
    expect(grootte(liggend)).toBeLessThan(grootte(staand));
  });

  it("werkt ook met weinig regels (dan zonder venster)", () => {
    const p = bouwTekstVideo({ regels: ["Werk zoeken?"], formaat: "1:1", lengte: 10 });
    const stijlen = tekstClips(p.clips).map((c) => c.stijl);
    expect(stijlen).toContain("bubbel-blauw");
    expect(stijlen).toContain("3d");
    expect(stijlen).not.toContain("venster");
    expect(tekstClips(p.clips).some((c) => c.tekst === "ZekerFlex")).toBe(true);
  });
});
