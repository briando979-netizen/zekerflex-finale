import { describe, expect, it } from "vitest";
import {
  DOC_LIVE,
  PORTRET,
  SELFIE_LIVE,
  beeldAanwijzing,
  beweging,
  docKantMeting,
  grijs,
  kaderInVideo,
  kanVanzelf,
  licht,
  portretAanwijzing,
  scherpte,
  selfieAanwijzing,
  serverAanwijzing,
  telSelfie,
  verklein,
} from "@/lib/kyc/camera-live";
import type { LiveMeting } from "@/lib/kyc/gezicht/beweging";

// De live begeleiding van de ID-camera (lib/kyc/camera-live.ts): kader, scherpte, glans, stilstand, en wanneer de
// foto vanzelf wordt gemaakt. Alles puur, met kunstmatige beelden.

/** Een grijs beeld met een functie per pixel. */
const maak = (w: number, h: number, f: (x: number, y: number) => number): Uint8Array => {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
};

const gezicht = (over: Partial<LiveMeting> = {}): LiveMeting => ({ draaiing: 0.01, oog: 0.2, breedteDeel: 0.35, score: 0.95, meerdere: false, ...over });

describe("kaderInVideo", () => {
  it("staand telefoonbeeld (9:16) in het 3:4-vak: het kader is 88% van de zichtbare breedte, gecentreerd", () => {
    const k = kaderInVideo(1080, 1920)!;
    // zichtbaar: de volle breedte (1080), want de video is smaller dan het vak
    expect(k.w).toBe(Math.round(1080 * 0.88));
    expect(k.h).toBe(Math.round((1080 * 0.88) / 1.586));
    // gecentreerd, op een pixel afronding na
    expect(Math.abs(k.x - (1080 - k.w) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(k.y - (1920 - k.h) / 2)).toBeLessThanOrEqual(1);
  });

  it("liggend laptopbeeld (16:9): er valt links en rechts iets weg, het kader past binnen het zichtbare deel", () => {
    const k = kaderInVideo(1920, 1080)!;
    const zichtB = 1080 * 0.75;
    expect(k.w).toBe(Math.round(zichtB * 0.88));
    expect(k.x).toBeGreaterThan((1920 - zichtB) / 2);
    expect(k.x + k.w).toBeLessThan((1920 + zichtB) / 2 + 1);
  });

  it("zonder videomaat: null", () => {
    expect(kaderInVideo(0, 1080)).toBeNull();
  });
});

describe("beeldmetingen", () => {
  it("grijs volgt de luminantie", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
    expect(Array.from(grijs(rgba, 3, 1))).toEqual([255, 0, 76]);
  });

  it("een scherp schaakbord is veel scherper dan een vlak beeld en een vloeiende overgang", () => {
    const bord = maak(64, 40, (x, y) => ((x + y) % 2 === 0 ? 30 : 220));
    const vlak = maak(64, 40, () => 128);
    const zacht = maak(64, 40, (x) => Math.round((x / 63) * 255));
    expect(scherpte(bord, 64, 40)).toBeGreaterThan(DOC_LIVE.minScherpte * 10);
    expect(scherpte(vlak, 64, 40)).toBe(0);
    expect(scherpte(zacht, 64, 40)).toBeLessThan(DOC_LIVE.minScherpte);
  });

  it("licht: het gemiddelde en het aandeel bijna witte pixels", () => {
    const g = maak(10, 10, (x) => (x < 2 ? 255 : 100));
    const l = licht(g);
    expect(l.glans).toBeCloseTo(0.2);
    expect(l.gemiddeld).toBeCloseTo((2 * 255 + 8 * 100) / 10);
  });

  it("verklein: blokgemiddelden, de ruis valt weg", () => {
    const g = maak(8, 4, (x, y) => ((x + y) % 2 === 0 ? 100 : 110));
    const k = verklein(g, 8, 4, 2);
    expect(k.length).toBe(4 * 2);
    expect(Array.from(k).every((v) => v === 105)).toBe(true);
  });

  it("beweging: gelijke beelden 0, het eerste beeld of een andere maat Infinity", () => {
    const a = maak(8, 8, () => 50);
    const b = maak(8, 8, () => 60);
    expect(beweging(a, a)).toBe(0);
    expect(beweging(a, b)).toBe(10);
    expect(beweging(null, a)).toBe(Infinity);
    expect(beweging(maak(4, 4, () => 1), a)).toBe(Infinity);
  });
});

describe("beeldAanwijzing (de browser zelf)", () => {
  const goed = { scherpte: 400, gemiddeld: 130, glans: 0.01, beweging: 1 };
  it("goed beeld: geen aanwijzing, dan mag de server meten", () => {
    expect(beeldAanwijzing(goed)).toBeNull();
  });
  it("te donker, glans, beweging of onscherp", () => {
    expect(beeldAanwijzing({ ...goed, gemiddeld: 20 })).toBe("licht");
    expect(beeldAanwijzing({ ...goed, glans: 0.2 })).toBe("glans");
    expect(beeldAanwijzing({ ...goed, beweging: 20 })).toBe("stil");
    expect(beeldAanwijzing({ ...goed, beweging: Infinity })).toBe("stil");
    expect(beeldAanwijzing({ ...goed, scherpte: 10 })).toBe("stil");
  });
});

describe("welke kant wat heeft", () => {
  it("paspoort: code en pasfoto; ID-kaart: pasfoto voor, code achter; rijbewijs achter: niets", () => {
    expect(docKantMeting("PASSPORT", "voor")).toEqual({ mrz: true, portret: true });
    expect(docKantMeting("ID_CARD", "voor")).toEqual({ mrz: false, portret: true });
    expect(docKantMeting("ID_CARD", "achter")).toEqual({ mrz: true, portret: false });
    expect(docKantMeting("DRIVERS_LICENSE", "voor")).toEqual({ mrz: false, portret: true });
    expect(docKantMeting("DRIVERS_LICENSE", "achter")).toEqual({ mrz: false, portret: false });
    expect(kanVanzelf(docKantMeting("DRIVERS_LICENSE", "achter"))).toBe(false);
  });
});

describe("portretAanwijzing (de afstand uit de pasfoto)", () => {
  it("ID-kaart: te klein = dichterbij, te groot = verder weg, ertussen goed; geen gezicht = zoeken", () => {
    expect(portretAanwijzing("ID_CARD", PORTRET.kaart.min - 0.02)).toBe("dichterbij");
    expect(portretAanwijzing("ID_CARD", PORTRET.kaart.max + 0.05)).toBe("verder");
    expect(portretAanwijzing("ID_CARD", 0.22)).toBe("goed");
    expect(portretAanwijzing("ID_CARD", null)).toBe("zoeken");
  });
  it("paspoort heeft een kleinere pasfoto in het kader", () => {
    expect(portretAanwijzing("PASSPORT", 0.12)).toBe("goed");
    expect(portretAanwijzing("ID_CARD", 0.12)).toBe("dichterbij");
  });
});

describe("serverAanwijzing (vanzelf de foto of niet)", () => {
  it("kant met code: alleen vanzelf als de code leesbaar is", () => {
    const pas = docKantMeting("PASSPORT", "voor");
    expect(serverAanwijzing("PASSPORT", pas, { leesbaar: true, portret: 0.12 })).toBe("goed");
    expect(serverAanwijzing("PASSPORT", pas, { leesbaar: false, portret: 0.05 })).toBe("dichterbij");
    expect(serverAanwijzing("PASSPORT", pas, { leesbaar: false, portret: 0.4 })).toBe("verder");
    expect(serverAanwijzing("PASSPORT", pas, { leesbaar: false, portret: 0.12 })).toBe("code");
    // een goed staande pasfoto zonder leesbare code is nooit genoeg
    expect(serverAanwijzing("ID_CARD", docKantMeting("ID_CARD", "achter"), { leesbaar: false, portret: null })).toBe("code");
  });
  it("voorkant ID-kaart: vanzelf als de pasfoto goed in het kader staat", () => {
    const voor = docKantMeting("ID_CARD", "voor");
    expect(serverAanwijzing("ID_CARD", voor, { leesbaar: null, portret: 0.22 })).toBe("goed");
    expect(serverAanwijzing("ID_CARD", voor, { leesbaar: null, portret: 0.05 })).toBe("dichterbij");
    expect(serverAanwijzing("ID_CARD", voor, { leesbaar: null, portret: null })).toBe("zoeken");
  });
  it("achterkant rijbewijs: nooit vanzelf", () => {
    expect(serverAanwijzing("DRIVERS_LICENSE", docKantMeting("DRIVERS_LICENSE", "achter"), { leesbaar: null, portret: null })).not.toBe("goed");
  });
});

describe("selfie", () => {
  it("te groot in beeld: verder weg; anders de bestaande aanwijzingen", () => {
    expect(selfieAanwijzing(gezicht({ breedteDeel: SELFIE_LIVE.maxBreedteDeel + 0.05 }))).toBe("verder");
    expect(selfieAanwijzing(gezicht())).toBe("goed");
    expect(selfieAanwijzing(gezicht({ breedteDeel: 0.1 }))).toBe("dichterbij");
    expect(selfieAanwijzing(gezicht({ draaiing: 0.3 }))).toBe("recht");
    expect(selfieAanwijzing(null)).toBe("geen-gezicht");
  });

  it("de teller loopt alleen op bij goede, stille beelden achter elkaar", () => {
    let n = 0;
    let vorige: LiveMeting | null = null;
    for (const m of [gezicht(), gezicht({ draaiing: 0.015 }), gezicht({ draaiing: 0.02 })]) {
      n = telSelfie(n, vorige, m);
      vorige = m;
    }
    expect(n).toBe(SELFIE_LIVE.goedeBeelden);
    // een beweging zet de teller op 1 (dit beeld is wel goed), een slecht beeld op 0
    expect(telSelfie(2, gezicht(), gezicht({ breedteDeel: 0.5 }))).toBe(1);
    expect(telSelfie(2, gezicht(), gezicht({ draaiing: 0.3 }))).toBe(0);
    expect(telSelfie(2, gezicht(), null)).toBe(0);
  });
});
