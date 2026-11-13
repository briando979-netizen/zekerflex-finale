import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOTO_FOUT_TEKST, FotoFoutError, fotoFoutSoort, isHeic } from "@/lib/shop/foto-fout";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

const lees = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Op mijn foto: oorzaak en melding", () => {
  it("herkent HEIC/HEIF aan type of bestandsnaam", () => {
    expect(isHeic("IMG_0001.HEIC", "")).toBe(true);
    expect(isHeic("foto.heif", "application/octet-stream")).toBe(true);
    expect(isHeic("x", "image/heic")).toBe(true);
    expect(isHeic("foto.jpg", "image/jpeg")).toBe(false);
  });

  it("geeft per oorzaak de soort terug en 'onbekend' voor andere fouten", () => {
    expect(fotoFoutSoort(new FotoFoutError("heic"))).toBe("heic");
    expect(fotoFoutSoort(new FotoFoutError("model"))).toBe("model");
    expect(fotoFoutSoort(new Error("iets anders"))).toBe("onbekend");
    expect(fotoFoutSoort("tekst")).toBe("onbekend");
  });

  it("elke oorzaak heeft een eigen melding in het Nederlands en Engels, en noemt de handmatige uitweg", () => {
    for (const sleutel of Object.values(FOTO_FOUT_TEKST)) {
      const a = (nl.paskamer as Record<string, unknown>)[sleutel];
      const b = (en.paskamer as Record<string, unknown>)[sleutel];
      expect(typeof a, sleutel).toBe("string");
      expect(typeof b, sleutel).toBe("string");
    }
    expect(nl.paskamer.pasFotoHeic).toMatch(/JPEG/);
    expect(nl.paskamer.pasFotoHeic).toMatch(/zelf invullen/);
  });

  it("fotoMeting valt terug op <img> met object-URL en meldt het model apart", () => {
    const bron = lees("components/marketing/paskamer/fotoMeting.ts");
    expect(bron).toContain('typeof createImageBitmap === "function"');
    expect(bron).toContain("URL.createObjectURL(bestand)");
    expect(bron).toContain("URL.revokeObjectURL(url)");
    expect(bron).toContain('new FotoFoutError("model")');
    expect(bron).not.toMatch(/\(\?<[=!]/);
  });

  it("het scherm toont de melding met role=alert en biedt de maten zelf invullen", () => {
    const bron = lees("components/marketing/paskamer/MijnFoto.tsx");
    expect(bron).toContain("FOTO_FOUT_TEKST[fout]");
    expect(bron).toMatch(/role="alert"/);
    expect(bron).toContain("pasFotoHandmatigTitel");
  });
});