import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOTO_FOUT_TEKST, FotoFoutError, fotoFoutSoort, foutRapport, isHeic, metStap, metTijdslimiet } from "@/lib/shop/foto-fout";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

const lees = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

afterEach(() => vi.useRealTimers());

describe("Op mijn foto: logboek, stappen en tijdslimiet", () => {
  it("het rapport bevat soort, stap, naam en bericht, zonder adressen of bestandsnamen", () => {
    const e = metStap(new TypeError("kon https://zekerflex.nl/paskamer/ml/x.wasm?token=abc niet laden voor IMG_0042.heic"), "wasm", "model");
    const r = foutRapport(e);
    expect(r).toContain("soort=model");
    expect(r).toContain("stap=wasm");
    expect(r).toContain("TypeError");
    expect(r).not.toMatch(/token|zekerflex\.nl|IMG_0042|https?:/);
    expect(r).toContain("<adres>");
    expect(r.length).toBeLessThanOrEqual(400);
  });

  it("een lang bericht wordt afgekapt en een onbekende fout krijgt de stap meten", () => {
    expect(foutRapport(new Error("x".repeat(5000))).length).toBeLessThanOrEqual(400);
    expect(foutRapport(new Error("boem"))).toContain("stap=meten");
  });

  it("metStap laat een bestaande stap staan", () => {
    const eerst = new FotoFoutError("model", "bundel");
    expect(metStap(eerst, "wasm").stap).toBe("bundel");
    expect(metStap(new FotoFoutError("heic"), "inlezen").stap).toBe("inlezen");
  });

  it("een traag model geeft na de limiet de soort traag; een snel model gaat gewoon door", async () => {
    vi.useFakeTimers();
    let afgebroken = false;
    const traag = metTijdslimiet(new Promise<number>(() => undefined), 1000, () => {
      afgebroken = true;
    });
    const verwacht = expect(traag).rejects.toMatchObject({ soort: "traag", stap: "wasm" });
    await vi.advanceTimersByTimeAsync(1001);
    await verwacht;
    expect(afgebroken).toBe(true);
    await expect(metTijdslimiet(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("elke melding bestaat ook voor traag, met de Edge-instelling alleen als mogelijke oorzaak", () => {
    expect(nl.paskamer.pasFotoTraag).toMatch(/mogelijke oorzaak/);
    expect(en.paskamer.pasFotoTraag).toMatch(/possible cause/);
  });

  it("het scherm meldt de fout aan de bestaande client-error-route", () => {
    const bron = lees("components/marketing/paskamer/MijnFoto.tsx");
    expect(bron).toContain("/api/client-error");
    expect(bron).toContain("foutRapport(fout)");
    expect(bron).not.toMatch(/bestand\.name|f\.name/);
  });
});

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
    expect(bron).toContain('metStap(e, "wasm", "model")');
    expect(bron).toContain('metTijdslimiet(laad()');
    expect(bron).not.toMatch(/\(\?<[=!]/);
  });

  it("het scherm toont de melding met role=alert en biedt de maten zelf invullen", () => {
    const bron = lees("components/marketing/paskamer/MijnFoto.tsx");
    expect(bron).toContain("FOTO_FOUT_TEKST[fout]");
    expect(bron).toMatch(/role="alert"/);
    expect(bron).toContain("pasFotoHandmatigTitel");
  });
});