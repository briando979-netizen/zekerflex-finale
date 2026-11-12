import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// leesMrzVanFoto (lib/kyc/mrz-lezen.ts): een foto van de eigen camera is het hele camerabeeld, maar de live meting las
// alleen het kader met de kaart. 12 nov, een echte poging: hele foto 0 van 8, het kader in 1 poging. De tweede poging is
// nu precies dat kader. De OCR is hier nagebootst: hij "ziet" de code alleen in een smalle strook (zoals de onderkant van
// het kader), niet in de grote onderkant van het hele beeld. De MRZ is het ICAO-voorbeeld (Utopia): verzonnen, geen BSN.

const TD1 = ["I<UTOD231458907<<<<<<<<<<<<<<<", "7408122F1204159UTO<<<<<<<<<<<6", "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"].join("\n");

const ocr = vi.hoisted(() => ({ maten: [] as { breed: number; hoog: number }[], modus: "kader" as "kader" | "altijd" | "nooit" }));
vi.mock("@/lib/ocr/engine", () => ({
  leesMrzTekst: async (png: Buffer) => {
    const m = await sharp(png).metadata();
    const maat = { breed: m.width ?? 0, hoog: m.height ?? 0 };
    ocr.maten.push(maat);
    // de onderkant van het kader is een smalle strook (1800 x ~500); de onderkant van een staand camerabeeld is 1800 x 1440
    const ziet = ocr.modus === "altijd" || (ocr.modus === "kader" && maat.hoog < 800);
    return { tekst: ziet ? TD1 : "", ms: 1 };
  },
}));

import { leesMrzVanFoto } from "@/lib/kyc/mrz-lezen";

const NU = new Date("2026-11-12T18:00:00+01:00");
const camerabeeld = (breed: number, hoog: number) => sharp({ create: { width: breed, height: hoog, channels: 3, background: "#8a8a8a" } }).jpeg({ quality: 90 }).toBuffer();

beforeEach(() => {
  ocr.maten.length = 0;
  ocr.modus = "kader";
});

describe("de eindcontrole leest ook het kader, zoals de live camera", () => {
  it("een staand camerabeeld (2160x3840): de hele foto lukt niet, het kader als tweede poging wel", async () => {
    const r = await leesMrzVanFoto(await camerabeeld(2160, 3840), NU);
    expect(r.uitslag?.geldig).toBe(true);
    expect(r.uitslag?.controles).toEqual({ documentnummer: true, geboortedatum: true, vervaldatum: true, totaal: true });
    expect(r.pogingen).toBe(2);
    // eerst de bestaande poging (onderkant van het hele beeld), dan het kader
    expect(ocr.maten[0]).toEqual({ breed: 1800, hoog: 1440 });
    expect(ocr.maten[1]!.breed).toBe(1800);
    expect(ocr.maten[1]!.hoog).toBeLessThan(800);
  });

  it("lukt de bestaande eerste poging al, dan blijft het bij één poging", async () => {
    ocr.modus = "altijd";
    const r = await leesMrzVanFoto(await camerabeeld(2160, 3840), NU);
    expect(r.uitslag?.geldig).toBe(true);
    expect(r.pogingen).toBe(1);
  });

  it("staat er nergens een code, dan alle 9 pogingen en geen uitslag", async () => {
    ocr.modus = "nooit";
    const r = await leesMrzVanFoto(await camerabeeld(2160, 3840), NU);
    expect(r.uitslag).toBeNull();
    expect(r.pogingen).toBe(9);
  });
});
