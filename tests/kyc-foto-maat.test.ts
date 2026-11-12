import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fotoMaatTekst, schoonMaat } from "@/lib/kyc/foto-bron";
import { fotoMaat } from "@/lib/kyc/foto-maat";
import { idControleWeergave } from "@/lib/admin/kyc-weergave";

// De maat van een ID-foto (12 nov 2026): bij de live camera de resolutie van de camerastream, uit het beeld zelf gelezen.
// Een paspoort op 1080x2336 las de MRZ niet, op 2160x3840 wel. Alleen breedte en hoogte, nooit iets anders.

describe("schoonMaat: alleen breedte en hoogte, gehele getallen 1..8000", () => {
  it("laat alleen { breed, hoog } door; andere sleutels (vingerafdruk) vallen weg", () => {
    expect(schoonMaat({ breed: 1080, hoog: 2336, deviceId: "abc", groupId: "x", label: "Back camera" })).toEqual({ breed: 1080, hoog: 2336 });
    expect(Object.keys(schoonMaat({ breed: 1, hoog: 8000, extra: 1 })!)).toEqual(["breed", "hoog"]);
  });
  it("geen getal, geen geheel getal of buiten 1..8000: niets", () => {
    for (const v of [{ breed: 0, hoog: 10 }, { breed: 8001, hoog: 10 }, { breed: 10.5, hoog: 10 }, { breed: "1080", hoog: 2336 }, { breed: 1080 }, null, "1080x2336", [1080, 2336]]) {
      expect(schoonMaat(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("de tekst voor Beheer", () => {
  it("dezelfde maat overal: camera BxH; verschillend: per vak", () => {
    expect(fotoMaatTekst({ front: { breed: 1080, hoog: 2336 }, back: { breed: 1080, hoog: 2336 } })).toBe("camera 1080×2336");
    expect(fotoMaatTekst({ front: { breed: 2160, hoog: 3840 }, selfie: { breed: 720, hoog: 1280 } })).toBe("voorkant 2160×3840, selfie 720×1280");
    expect(fotoMaatTekst({ front: { breed: 1080, hoog: 2336, deviceId: "x" } })).toBe("camera 1080×2336");
    expect(fotoMaatTekst(null)).toBeNull();
    expect(fotoMaatTekst({ front: "groot" })).toBeNull();
  });
  it("Beheer toont hem naast de fotobron", () => {
    const w = idControleWeergave("AI_LOCAL", { bron: { front: "live-knop", back: "live-knop" }, maat: { front: { breed: 1080, hoog: 2336 }, back: { breed: 1080, hoog: 2336 } } });
    expect(w.fotoBron).toBe("voorkant live (knop), achterkant live (knop) · camera 1080×2336");
    expect(idControleWeergave("AI_LOCAL", { maat: { front: { breed: 1080, hoog: 2336 } } }).fotoBron).toBe("camera 1080×2336");
    expect(idControleWeergave("AI_LOCAL", {}).fotoBron).toBeNull();
  });
});

describe("fotoMaat leest de maat uit het beeld", () => {
  it("een staand camerabeeld, en een onleesbaar beeld geeft niets", async () => {
    const jpg = await sharp({ create: { width: 1080, height: 2336, channels: 3, background: "#808080" } }).jpeg().toBuffer();
    expect(await fotoMaat(jpg)).toEqual({ breed: 1080, hoog: 2336 });
    expect(await fotoMaat(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("de camera: eerst 4K, dan Full HD, pas dan zonder eisen", () => {
  it("IdScan heeft de tussenstap in de terugval en de eerste vraag blijft 3840x2160", () => {
    const s = readFileSync(path.join(process.cwd(), "components/app/IdScan.tsx"), "utf8");
    const vier = s.indexOf("width: { ideal: 3840 }, height: { ideal: 2160 }");
    const hd = s.indexOf("width: { ideal: 1920 }, height: { ideal: 1080 }");
    const kaal = s.indexOf("getUserMedia({ audio: false, video: bron })");
    expect(vier).toBeGreaterThan(-1);
    expect(hd).toBeGreaterThan(vier);
    expect(kaal).toBeGreaterThan(hd);
  });
});
