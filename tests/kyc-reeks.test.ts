import { describe, expect, it } from "vitest";
import { leesReeks, REEKS, vatReeksSamen, voegToe, type LiveReeks } from "@/lib/kyc/gezicht/reeks";
import type { LiveMeting } from "@/lib/kyc/gezicht/beweging";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";
import { REEKS_PREFIX } from "@/lib/kyc/gezicht/reeks-opslag";

// De live reeks van de tweede selfie (lib/kyc/gezicht/reeks.ts): voorlopig alleen meten, geen poort.

const NU = Date.UTC(2026, 10, 11, 20, 0, 0);
const meting = (draaiing: number, over: Partial<LiveMeting> = {}): LiveMeting => ({ draaiing, oog: 0.33, breedteDeel: 0.3, score: 0.95, meerdere: false, ...over });
/** een reeks met een meting per `stap` ms, eindigend op NU */
const reeksVan = (draaiingen: number[], stap = 400): LiveReeks => {
  let r: LiveReeks | null = null;
  draaiingen.forEach((d, i) => {
    r = voegToe(r, meting(d), NU - (draaiingen.length - 1 - i) * stap);
  });
  return r ?? { b: NU, r: [] };
};

describe("vatReeksSamen", () => {
  it("een echte draai voor de camera heeft tussenstanden", () => {
    const s = vatReeksSamen(reeksVan([0.02, 0.03, 0.03, 0.11, 0.19, 0.27, 0.31, 0.31]), NU);
    // van de laatste rechte stand (0,03) naar de eindstand (0,31): 0,11 en 0,19 liggen tussen 25% en 75%
    expect(s).toEqual({ beelden: 8, tussenstanden: 2, ms: 5 * 400, draai: 0.28 });
  });

  it("twee losse foto's springen in één keer: geen tussenstand (zo ging de rooktest met twee portretten)", () => {
    const s = vatReeksSamen(reeksVan([0.04, 0.04, 0.04, 0.32, 0.32]), NU);
    expect(s).toEqual({ beelden: 5, tussenstanden: 0, ms: 2 * 400, draai: 0.28 });
  });

  it("naar de andere kant draaien telt net zo", () => {
    expect(vatReeksSamen(reeksVan([0, -0.1, -0.2, -0.3]), NU)).toMatchObject({ tussenstanden: 2, draai: -0.3 });
  });

  it("geen draai (alles recht) of te weinig metingen: geen duur, geen tussenstanden", () => {
    expect(vatReeksSamen(reeksVan([0.02, 0.03, 0.04, 0.05]), NU)).toEqual({ beelden: 4, tussenstanden: 0, ms: null, draai: 0.01 });
    expect(vatReeksSamen(reeksVan([0.3]), NU)).toEqual({ beelden: 1, tussenstanden: 0, ms: null, draai: null });
    expect(vatReeksSamen(null, NU)).toEqual({ beelden: 0, tussenstanden: 0, ms: null, draai: null });
    // nooit recht geweest: geen begin om vanaf te meten
    expect(vatReeksSamen(reeksVan([0.3, 0.31, 0.32]), NU)).toMatchObject({ ms: null, draai: null });
  });

  it("de eerste selfie mag iets minder recht zijn (tot de grens van de server)", () => {
    expect(vatReeksSamen(reeksVan([0.1, 0.1, 0.2, 0.3, 0.4]), NU)).toMatchObject({ tussenstanden: 2, draai: 0.3 });
  });

  it("alleen het laatste half uur telt", () => {
    const oud = voegToe(voegToe(null, meting(0.02), NU - 40 * 60_000), meting(0.15), NU - 39 * 60_000);
    const nu = voegToe(voegToe(oud, meting(0.03), NU - 400), meting(0.32), NU);
    expect(vatReeksSamen(nu, NU)).toEqual({ beelden: 2, tussenstanden: 0, ms: 400, draai: 0.29 });
  });

  it("de tussenstand ligt tussen 25% en 75% van de draai", () => {
    expect(REEKS.tussenVan).toBe(0.25);
    expect(REEKS.tussenTot).toBe(0.75);
    // 0,09 is 22% van 0,4 en 0,34 is 85%: geen van beide telt; 0,12 (30%) en 0,28 (70%) wel
    expect(vatReeksSamen(reeksVan([0, 0.09, 0.34, 0.4]), NU).tussenstanden).toBe(0);
    expect(vatReeksSamen(reeksVan([0, 0.12, 0.28, 0.4]), NU).tussenstanden).toBe(2);
  });
});

describe("voegToe en leesReeks (de opslag: alleen getallen)", () => {
  it("bewaart per meting alleen tijd (ms sinds het begin), draaiing, oog en score, afgerond", () => {
    const r = voegToe(voegToe(null, meting(0.123456, { oog: 0.333333, score: 0.94999 }), NU), meting(0.2), NU + 450);
    expect(r).toEqual({ b: NU, r: [[0, 0.123, 0.333, 0.95], [450, 0.2, 0.33, 0.95]] });
    expect(JSON.stringify(r)).toMatch(/^[\d{}[\],.:"br-]+$/);
  });

  it("houdt hoogstens 60 metingen", () => {
    let r: LiveReeks | null = null;
    for (let i = 0; i < 75; i++) r = voegToe(r, meting(i / 1000), NU + i * 100);
    expect(r?.r).toHaveLength(REEKS.max);
    expect(r?.r[0]?.[0]).toBe(15 * 100);
  });

  it("begint opnieuw na 2 uur stilte (een afgebroken poging)", () => {
    const oud = voegToe(null, meting(0.1), NU);
    const later = voegToe(oud, meting(0.2), NU + REEKS.geldigMs + 1);
    expect(later).toEqual({ b: NU + REEKS.geldigMs + 1, r: [[0, 0.2, 0.33, 0.95]] });
  });

  it("leest een bewaarde waarde soepel: rommel is geen reeks, kapotte metingen vallen weg", () => {
    expect(leesReeks(null)).toBeNull();
    expect(leesReeks("x")).toBeNull();
    expect(leesReeks({ b: "nu", r: [] })).toBeNull();
    expect(leesReeks({ b: NU, r: [[0, 0.1, 0.3, 0.9], [1, "a", 0.3, 0.9], [2, 0.2], null] })).toEqual({ b: NU, r: [[0, 0.1, 0.3, 0.9]] });
  });

  it("de sleutel wordt gewist als iemand zijn account laat verwijderen (AVG)", () => {
    expect(REEKS_PREFIX).toBe("gezicht-live:");
    expect(ERASABLE_KV_PREFIXES).toContain(REEKS_PREFIX);
  });
});
