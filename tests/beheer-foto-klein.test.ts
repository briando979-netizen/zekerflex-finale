import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { KLEIN_BREEDTE, kleineVersie } from "@/lib/admin/foto-klein";

// Admin → Gebruikers, 12 nov: de tegels met ID-foto's laadden elke foto op volle grootte (1–2 MB; met 14
// tegelijk 29 s per foto). Nu een kleine versie voor de tegel; een klik opent het origineel. Bewijs zonder echte
// ID's: een eigen nepdocument (vlakken, strepen en fijne lijnen), op tegelgrootte vergeleken met het origineel.

const B = 2400;
const H = 1600;

/** Een nepdocument: gekleurde vlakken, strepen van 6 px en lijnen van 1 px (het lastigste om te verkleinen). */
function nepdocument(): Buffer {
  const px = Buffer.alloc(B * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < B; x++) {
      const i = (y * B + x) * 3;
      let r = 235, g = 230, b = 220; // papier
      if (x > 120 && x < 820 && y > 200 && y < 1100) [r, g, b] = [170, 150, 140]; // pasfotovlak
      if (y > 1250 && y < 1450 && Math.floor(x / 6) % 2 === 0) [r, g, b] = [30, 30, 40]; // strepen (MRZ-achtig)
      if (x > 1000 && y > 250 && y < 1050 && y % 40 < 1) [r, g, b] = [20, 40, 120]; // fijne lijnen
      if (x > 1000 && x < 2200 && y > 120 && y < 180) [r, g, b] = [180, 30, 40]; // rode balk
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
  return px;
}

/** Gemiddeld verschil per kleurkanaal (0–255) tussen twee beelden op tegelgrootte (400×300 = 200×150 op 2×). */
async function verschilOpTegel(a: Buffer | Uint8Array, b: Buffer | Uint8Array): Promise<number> {
  const tegel = (x: Buffer | Uint8Array) => sharp(x).rotate().resize(400, 300, { fit: "cover" }).removeAlpha().raw().toBuffer();
  const [pa, pb] = await Promise.all([tegel(a), tegel(b)]);
  let som = 0;
  for (let i = 0; i < pa.length; i++) som += Math.abs((pa[i] ?? 0) - (pb[i] ?? 0));
  return som / pa.length;
}

describe("kleine versie van een ID-foto voor de tegels", () => {
  it("rechtop, hooguit 800 px breed, JPEG zonder metadata, veel kleiner, en op tegelgrootte niet te onderscheiden", async () => {
    // zoals een telefoon hem opslaat: liggend vastgelegd, met de EXIF-stand "90° gedraaid" (6) en een GPS-achtige EXIF
    const origineel = await sharp(nepdocument(), { raw: { width: B, height: H, channels: 3 } })
      .jpeg({ quality: 92 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const klein = await kleineVersie(origineel);
    expect(klein).not.toBeNull();
    const meta = await sharp(Buffer.from(klein as Uint8Array)).metadata();
    expect(meta.format).toBe("jpeg");
    // rechtop gezet: de staande stand (1600 breed × 2400 hoog) verkleind naar 800 breed
    expect(meta.width).toBe(KLEIN_BREEDTE);
    expect(meta.height).toBe(1200);
    expect(meta.orientation ?? 1).toBe(1);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect((klein as Uint8Array).length).toBeLessThan(origineel.length / 3);
    // op de tegel: gemiddeld minder dan 3 van de 255 verschil per kanaal
    expect(await verschilOpTegel(origineel, klein as Uint8Array)).toBeLessThan(3);
  });

  it("een kleine foto wordt nooit groter gemaakt", async () => {
    const klein = await sharp({ create: { width: 500, height: 300, channels: 3, background: "#c0c0c0" } }).jpeg().toBuffer();
    const uit = await kleineVersie(klein);
    expect((await sharp(Buffer.from(uit as Uint8Array)).metadata()).width).toBe(500);
  });

  it("geen afbeelding: null, en dan geeft de route het origineel (nooit een lege tegel)", async () => {
    expect(await kleineVersie(new TextEncoder().encode("geen foto"))).toBeNull();
    const route = readFileSync(path.join(process.cwd(), "app/api/admin/gebruikers/[id]/identiteit/[checkId]/beeld/route.ts"), "utf8");
    expect(route).toMatch(/const kleintje = klein \? await kleineVersie\(file\.bytes\) : null;\s*if \(kleintje\) \{/);
    expect(route).toMatch(/"Content-Type": "image\/jpeg"[^}]*"Cache-Control": "private, no-store"/);
    // dezelfde toegang als de volle foto: strikt PLATFORM_ADMIN, en de inzage in het auditlog
    expect(route).toMatch(/withAdminAccess<[^>]+>\(\["PLATFORM_ADMIN"\]/);
    expect(route).toMatch(/action: "kyc\.beeld_bekeken"/);
  });

  it("de tegel laadt klein, een klik opent het volle origineel", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    const tegel = lees("components/admin/IdFoto.tsx");
    expect(tegel).toMatch(/<a href=\{src\}[^>]*title=\{`\$\{label\} op ware grootte`\}/);
    expect(tegel).toMatch(/<img src=\{klein \?\? src\}/);
    const pagina = lees("app/admin/gebruikers/[id]/page.tsx");
    expect(pagina).toMatch(/<IdFoto key=\{f\.id\} src=\{`[^`]+beeld\?welk=\$\{f\.id\}`\} klein=\{`[^`]+beeld\?welk=\$\{f\.id\}&klein=1`\}/);
    expect(pagina).toMatch(/<KopFoto src=\{kopSelfie\} klein=\{`\$\{kopSelfie\}&klein=1`\}/);
  });
});
