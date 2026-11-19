import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE, type LiveMeting } from "@/lib/kyc/gezicht/beweging";
import { DOEL_HOEK, DRAAI_STABIELE_BEELDEN, KNOP_MAX_AFGEWEZEN, METER_BOOG, METER_MAX, draaiStand, fotoMag, knopAccepteert, naaldHoek, telStabiel } from "@/lib/kyc/gezicht/draai-meter";
import { AUTH_DICTS } from "@/lib/i18n/auth";

// De hoofddraai-meter bij de tweede selfie (18 nov 2026): de wijzer volgt de live meting, "tot hier" staat op de doelhoek,
// de foto gaat pas na een paar goede beelden achter elkaar, en de drempels van de server blijven onaangeroerd.

const ref: LiveMeting = { draaiing: 0.02, oog: 0.2, breedteDeel: 0.3, score: 0.95, meerdere: false };
const m = (over: Partial<LiveMeting>): LiveMeting => ({ ...ref, ...over });

describe("de hoofddraai-meter", () => {
  it("de wijzer loopt van 0 tot 1,5 keer de doelhoek; 'tot hier' staat op 1", () => {
    expect(naaldHoek(0)).toBe(0);
    expect(DOEL_HOEK).toBeCloseTo(METER_BOOG / METER_MAX, 1);
    expect(naaldHoek(1)).toBe(DOEL_HOEK);
    expect(naaldHoek(-1)).toBe(-DOEL_HOEK);
    expect(naaldHoek(5)).toBe(METER_BOOG);
    expect(naaldHoek(-5)).toBe(-METER_BOOG);
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

  it("de foto gaat pas na twee goede beelden achter elkaar; één slecht beeld begint opnieuw", () => {
    expect(DRAAI_STABIELE_BEELDEN).toBe(2);
    let t = 0;
    t = telStabiel(t, true);
    expect(fotoMag(t)).toBe(false);
    t = telStabiel(t, false);
    expect(t).toBe(0);
    t = telStabiel(telStabiel(t, true), true);
    expect(fotoMag(t)).toBe(true);
  });

  it("de teksten bestaan in alle vijf talen en het scherm gebruikt de meter met aria-live", () => {
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      expect(d.onb.scan.live.draaiUitleg.length, taal).toBeGreaterThan(20);
      expect(d.onb.scan.live.draaiTotHier.length, taal).toBeGreaterThan(2);
      expect(d.onb.scan.live.knopOpnieuw, taal).toContain("{reden}");
      expect(d.onb.scan.live.gelukt.length, taal).toBeGreaterThan(2);
    }
    const scherm = readFileSync(path.join(process.cwd(), "components/app/IdScan.tsx"), "utf8");
    expect(scherm).toContain("<HoofdDraai ");
    expect(scherm).toContain("fotoMag(stabiel)");
    const meter = readFileSync(path.join(process.cwd(), "components/app/HoofdDraai.tsx"), "utf8");
    expect(meter).toContain('aria-live="polite"');
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
