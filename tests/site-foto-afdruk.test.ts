import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { extractBusiness } from "@/lib/website-check/proposal";
import { afdrukVerschil, fotoAfdruk, zonderDubbeleFotos } from "@/lib/sites/foto-afdruk";

// Nieuwe website uit de check (4 nov, na de site van marktzichtetenendrinken.nl): geen
// "Handige links" of afgekapte teasers als aanbod, en dezelfde foto in een andere maat
// maar één keer.

/** Een foto met een eigen patroon: links licht, rechts donker (of andersom). */
async function foto(w: number, h: number, omgekeerd = false): Promise<{ bytes: Buffer; width: number; height: number }> {
  const half = Math.round(w / 2);
  const [a, b] = omgekeerd ? [30, 220] : [220, 30];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${half}" height="${h}" fill="rgb(${a},${a},${a})"/><rect x="${half}" width="${w - half}" height="${h}" fill="rgb(${b},${b},${b})"/><rect y="${Math.round(h * 0.6)}" width="${w}" height="${Math.round(h * 0.2)}" fill="rgb(120,120,120)"/></svg>`;
  const bytes = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  return { bytes, width: w, height: h };
}

describe("dubbele foto's", () => {
  it("herkent dezelfde foto in een andere maat, en houdt verschillende foto's apart", async () => {
    const [groot, klein, anders] = await Promise.all([foto(1600, 1000), foto(640, 400), foto(1600, 1000, true)]);
    const a = (await fotoAfdruk(groot.bytes))!;
    expect(afdrukVerschil(a, (await fotoAfdruk(klein.bytes))!)).toBeLessThanOrEqual(6);
    expect(afdrukVerschil(a, (await fotoAfdruk(anders.bytes))!)).toBeGreaterThan(6);
    expect(await fotoAfdruk(Buffer.from("geen foto"))).toBeNull();
  });

  it("laat van een dubbele de grootste staan, op de plek waar hij het eerst stond", async () => {
    const [klein, anders, groot] = await Promise.all([foto(640, 400), foto(1600, 1000, true), foto(1600, 1000)]);
    const { fotos, bron } = await zonderDubbeleFotos([klein, anders, null, groot], ["klein.jpg", "anders.jpg", "kapot.jpg", "groot.jpg"]);
    expect(fotos.map((f) => f?.width ?? null)).toEqual([1600, 1600, null, null]);
    expect(bron[0]).toBe("groot.jpg");
    expect(fotos[1]).toBe(anders);
  });
});

describe("kopjes die geen aanbod zijn", () => {
  it("slaat linklijsten, afgekapte teasers en de eigen naam over", () => {
    const html = `<html><head><meta property="og:site_name" content="Marktzicht Eten &amp; Drinken"></head><body>
      <h2>Marktzicht Eten &amp; Drinken</h2><p>Welkom bij ons op de markt, al sinds jaar en dag een begrip.</p>
      <h2>Bij MarktZicht eten &amp; drinken zit je ...</h2><p>Lekker aan tafel met uitzicht op de markt en de kerk.</p>
      <h3>Handige links</h3><p>Reserveren, menukaart en contact met ons team voor vragen.</p>
      <h2>Het menu</h2><p>Heerlijke hapjes, verrassende gerechten en nog meer om te ontdekken.</p>
      <h2>Marktzicht evenementen</h2><p>Een feest, een borrel of een diner met een groep: wij regelen het.</p>
    </body></html>`;
    const koppen = extractBusiness(html, "https://marktzicht.example.com/").secties.map((s) => s.kop);
    expect(koppen).toEqual(["Het menu", "Marktzicht evenementen"]);
  });
});
