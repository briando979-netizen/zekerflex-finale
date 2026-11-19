import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE, type LiveMeting } from "@/lib/kyc/gezicht/beweging";
import { DOEL_HOEK, DRAAI_STABIELE_BEELDEN, KNOP_MAX_AFGEWEZEN, METER_BOOG, METER_MAX, NAALD_MAX, VOORBEREID_VANAF, draaiStand, fotoMag, knopAccepteert, naaldHoek, stopTonen, telStabiel } from "@/lib/kyc/gezicht/draai-meter";
import { AUTH_DICTS } from "@/lib/i18n/auth";

// De hoofddraai-meter bij de tweede selfie (18 nov 2026): de wijzer volgt de live meting, "tot hier" staat op de doelhoek,
// de foto gaat pas na een paar goede beelden achter elkaar, en de drempels van de server blijven onaangeroerd.

const ref: LiveMeting = { draaiing: 0.02, oog: 0.2, breedteDeel: 0.3, score: 0.95, meerdere: false };
const m = (over: Partial<LiveMeting>): LiveMeting => ({ ...ref, ...over });

describe("de hoofddraai-meter", () => {
  it("'tot hier' staat op 1 en de wijzer komt daar nooit voorbij (19 nov 2026: een doorlopende wijzer nodigde uit om door te draaien)", () => {
    expect(naaldHoek(0)).toBe(0);
    expect(NAALD_MAX).toBe(1);
    expect(METER_MAX).toBeGreaterThan(NAALD_MAX);
    expect(DOEL_HOEK).toBeCloseTo(METER_BOOG / METER_MAX, 1);
    expect(naaldHoek(1)).toBe(DOEL_HOEK);
    expect(naaldHoek(-1)).toBe(-DOEL_HOEK);
    expect(naaldHoek(5)).toBe(DOEL_HOEK);
    expect(naaldHoek(-5)).toBe(-DOEL_HOEK);
    expect(naaldHoek(3.6)).toBe(DOEL_HOEK);
  });

  it("STOP zodra het doel gehaald is: goed, te ver, of de wijzer op 'tot hier' (ook als het gezicht onzeker wordt)", () => {
    expect(stopTonen(draaiStand(ref, m({ draaiing: 0.02 + LIVE.draaiVanaf, oog: 0.2 * 0.9 })))).toBe(true);
    expect(stopTonen(draaiStand(ref, m({ draaiing: 0.02 + LIVE.draaiVanaf, oog: 0.2 * 0.6 })))).toBe(true);
    expect(stopTonen(draaiStand(ref, m({ draaiing: 0.9, score: 0.5 })))).toBe(true);
    expect(stopTonen(draaiStand(ref, m({ draaiing: -0.088 })))).toBe(false);
    expect(stopTonen(draaiStand(ref, null))).toBe(false);
    // de foto ligt al klaar vóór de meting zodra het hoofd halverwege is
    expect(VOORBEREID_VANAF).toBeGreaterThan(0);
    expect(VOORBEREID_VANAF).toBeLessThan(1);
  });

  it("vertaalt de live meting naar een stand: nog niet, goed (vanaf LIVE.draaiVanaf), te ver, geen gezicht", () => {
    expect(draaiStand(ref, null)).toMatchObject({ geenGezicht: true, goed: false });
    expect(draaiStand(ref, m({ meerdere: true }))).toMatchObject({ geenGezicht: true });
    // −0,088 tegenover 0,02: een derde van de doelhoek, naar links
    const beetje = draaiStand(ref, m({ draaiing: -0.088 }));
    expect(beetje.goed).toBe(false);
    expect(beetje.richting).toBe(-1);
    expect(beetje.fractie).toBeCloseTo(-0.108 / LIVE.draaiVanaf, 3);
    const goed = draaiStand(ref, m({ draaiing: 0.02 + LIVE.draaiVanaf, oog: 0.2 * 0.9 }));
    expect(goed).toMatchObject({ goed: true, teVer: false, richting: 1 });
    expect(goed.fractie).toBeCloseTo(1, 5);
    // ver genoeg, maar de ogen te dicht bij elkaar: te ver (of een plat beeld)
    expect(draaiStand(ref, m({ draaiing: 0.02 + LIVE.draaiVanaf, oog: 0.2 * 0.6 }))).toMatchObject({ goed: false, teVer: true });
    // onzekere detector bij een ver gedraaid hoofd: te ver, niet "geen gezicht"
    expect(draaiStand(ref, m({ draaiing: 0.5, score: 0.5 }))).toMatchObject({ teVer: true, geenGezicht: false });
    expect(draaiStand(ref, m({ draaiing: 0.05, score: 0.5 }))).toMatchObject({ geenGezicht: true });
  });

  it("de foto gaat na één goed beeld (de foto wordt daarna toch nagemeten); een slecht beeld begint opnieuw", () => {
    expect(DRAAI_STABIELE_BEELDEN).toBe(1);
    expect(fotoMag(0)).toBe(false);
    expect(fotoMag(telStabiel(0, true))).toBe(true);
    expect(telStabiel(1, false)).toBe(0);
  });

  it("de teksten bestaan in alle vijf talen en het scherm gebruikt de meter met aria-live", () => {
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      expect(d.onb.scan.live.draaiUitleg.length, taal).toBeGreaterThan(20);
      expect(d.onb.scan.live.draaiTotHier.length, taal).toBeGreaterThan(2);
      expect(d.onb.scan.live.knopOpnieuw, taal).toContain("{reden}");
      expect(d.onb.scan.live.draaiStopWoord.length, taal).toBeGreaterThan(2);
      expect(d.onb.scan.live.draaiStop.length, taal).toBeGreaterThan(5);
      expect(d.onb.scan.live.draaiTerug.length, taal).toBeGreaterThan(5);
      expect(d.onb.scan.live.gelukt.length, taal).toBeGreaterThan(2);
    }
    const scherm = readFileSync(path.join(process.cwd(), "components/app/IdScan.tsx"), "utf8");
    expect(scherm).toContain("<HoofdDraai");
    expect(scherm).toContain("fotoMag(stabiel)");
    // de foto van hetzelfde beeld als de meting: klaargelegd zodra het hoofd het doel nadert
    expect(scherm).toContain(">= VOORBEREID_VANAF ? await fotoVanVideo(v,");
    expect(scherm).toContain("const foto = vooraf ?? (await fotoVanVideo(v,");
    const meter = readFileSync(path.join(process.cwd(), "components/app/HoofdDraai.tsx"), "utf8");
    expect(meter).toContain('aria-live="polite"');
    expect(meter).toContain("stopTonen(stand)");
    // bij "minder beweging" staat het voorbeeldhoofd stil op de doelhoek (IdScan geeft dat door als `stil`)
    expect(scherm).toContain('setMinderBeweging(window.matchMedia("(prefers-reduced-motion: reduce)").matches)');
    expect(meter).toContain("stil ? `rotateY(");
  });
});

describe("de knopfoto van de tweede selfie wordt nagemeten", () => {
  // 19 nov 2026: de eerste twee echte pogingen na de meter waren knopfoto's die tijdens het aftellen te ver doordraaiden
  // (0,41 en 0,88 bij een doel van 0,24); de server keurde ze af als "platgedrukt" en een mens moest kijken
  it("laat een foto die de regels haalt door, weigert er hooguit KNOP_MAX_AFGEWEZEN, en gaat zonder meting gewoon door", () => {
    expect(knopAccepteert(true, 0)).toBe(true);
    expect(knopAccepteert(null, 0)).toBe(true);
    expect(knopAccepteert(false, 0)).toBe(false);
    expect(knopAccepteert(false, KNOP_MAX_AFGEWEZEN - 1)).toBe(false);
    expect(knopAccepteert(false, KNOP_MAX_AFGEWEZEN)).toBe(true);
  });

  it("het scherm meet de knopfoto na met bewegingVoldoet en toont de reden", () => {
    const scherm = readFileSync(path.join(process.cwd(), "components/app/IdScan.tsx"), "utf8");
    expect(scherm).toContain("knopAccepteert(voldoet, knopAfgewezen.current)");
    expect(scherm).toContain('l.knopOpnieuw.replace("{reden}", liveTekst(d.aanwijzing))');
    expect(scherm).toContain('role="alert"');
  });
});
