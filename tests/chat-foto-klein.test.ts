import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { KLEIN_TEGELIJK, KLEIN_ZIJDE, kleineChatFoto } from "@/lib/messaging/foto-klein";

// Chat, 12 nov: wie een gesprek opende laadde elke foto op volle grootte (0,75–2,3 MB; 10 foto's, 8–11 s per foto).
// Nu een kleine versie voor de bubbel; een tik opent het origineel. Bewijs zonder echte foto's: een eigen nepfoto
// (verloop, vlakken, randen en wat ruis), op weergavegrootte vergeleken met het origineel.

const B = 2048;
const H = 1536;
const BUBBEL_HOOG = 288; // max-h-72 in MessageBubble

/** Een nepfoto zoals cleanPhoto hem bewaart: liggend, 2048 px, met een vloeiend verloop, vlakken, scherpe randen en ruis. */
function nepfoto(): Buffer {
  const px = Buffer.alloc(B * H * 3);
  let zaad = 12345;
  const ruis = () => ((zaad = (zaad * 1103515245 + 12345) & 0x7fffffff) % 13) - 6;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < B; x++) {
      const i = (y * B + x) * 3;
      let r = 90 + (x / B) * 120, g = 140 + (y / H) * 60, b = 200 - (x / B) * 80; // lucht/verloop
      if (y > H * 0.62) [r, g, b] = [70 + (y % 7), 110, 60]; // gras
      if (x > 500 && x < 900 && y > 400 && y < 1100) [r, g, b] = [180, 60, 50]; // rood vlak (gebouw)
      if (x > 1300 && x < 1800 && y > 300 && y < 340) [r, g, b] = [20, 20, 25]; // donkere balk (rand)
      px[i] = Math.max(0, Math.min(255, r + ruis()));
      px[i + 1] = Math.max(0, Math.min(255, g + ruis()));
      px[i + 2] = Math.max(0, Math.min(255, b + ruis()));
    }
  }
  return px;
}

/** Gemiddeld verschil per kleurkanaal (0–255) tussen twee beelden, allebei rechtop en verkleind tot b × h. */
async function verschil(a: Buffer | Uint8Array, c: Buffer | Uint8Array, b: number, h: number): Promise<number> {
  const op = (x: Buffer | Uint8Array) => sharp(x).rotate().resize(b, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [pa, pc] = await Promise.all([op(a), op(c)]);
  let som = 0;
  for (let i = 0; i < pa.length; i++) som += Math.abs((pa[i] ?? 0) - (pc[i] ?? 0));
  return som / pa.length;
}

const rij = globalThis as typeof globalThis & { __zfChatFotoKlein?: { bezig: number; wachtend: Array<() => void> } };
afterEach(() => {
  delete rij.__zfChatFotoKlein;
});

describe("kleine versie van een chatfoto voor de bubbel", () => {
  it("rechtop, hooguit 1080 px, JPEG zonder metadata, veel kleiner, en op weergavegrootte niet te onderscheiden", async () => {
    // zoals een telefoon hem aanlevert: liggend vastgelegd met de EXIF-stand "90° gedraaid" (6)
    const origineel = await sharp(nepfoto(), { raw: { width: B, height: H, channels: 3 } })
      .jpeg({ quality: 82, mozjpeg: true })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const klein = await kleineChatFoto(origineel, "image/jpeg");
    expect(klein).not.toBeNull();
    const meta = await sharp(Buffer.from(klein as Uint8Array)).metadata();
    expect(meta.format).toBe("jpeg");
    // eerst rechtop gezet (staand: 1536 × 2048), dan verkleind tot 1080 aan de lange kant
    expect(meta.width).toBe(810);
    expect(meta.height).toBe(KLEIN_ZIJDE);
    expect(meta.orientation ?? 1).toBe(1);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect((klein as Uint8Array).length).toBeLessThan(origineel.length / 3);
    // de bubbel toont hem 288 css-px hoog (216 breed); op 1×, 2× en 3× gemiddeld minder dan 3 van de 255 per kanaal
    const gemeten: string[] = [];
    for (const dichtheid of [1, 2, 3]) {
      const v = await verschil(origineel, klein as Uint8Array, 216 * dichtheid, BUBBEL_HOOG * dichtheid);
      gemeten.push(`${dichtheid}×: ${v.toFixed(2)}`);
      expect(v, `${dichtheid}×`).toBeLessThan(3);
    }
    // het bewijs voor "het uiterlijk blijft gelijk" staat zo in de uitvoer van de controle
    console.info(`chatfoto klein: ${origineel.length} → ${(klein as Uint8Array).length} bytes; verschil per kanaal (0–255) ${gemeten.join(", ")}`);
  });

  it("is groot genoeg voor de bubbel, ook op een telefoon met driedubbele dichtheid", () => {
    // staand: 288 css-px hoog × 3 = 864; liggend raakt hij eerst de hoogte (4:3 → 384 breed, 16:9 → 512), op 2× ≤ 1024
    expect(KLEIN_ZIJDE).toBeGreaterThanOrEqual(BUBBEL_HOOG * 3);
    expect(KLEIN_ZIJDE).toBeGreaterThanOrEqual(Math.round((BUBBEL_HOOG * 16) / 9) * 2);
  });

  it("een kleine foto wordt nooit groter gemaakt", async () => {
    const klein = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#7a9cc0" } }).jpeg({ quality: 95 }).toBuffer();
    const uit = await kleineChatFoto(klein, "image/jpeg");
    expect((await sharp(Buffer.from(uit ?? klein)).metadata()).width).toBe(600);
  });

  it("een png met echte doorzichtigheid blijft het origineel; een dichte png met alfakanaal wordt wel klein", async () => {
    const maak = (alfa: number) => sharp({ create: { width: 1600, height: 1200, channels: 4, background: { r: 200, g: 120, b: 40, alpha: alfa } } }).png().toBuffer();
    expect(await kleineChatFoto(await maak(0.5), "image/png")).toBeNull();
    const dicht = await sharp(nepfoto(), { raw: { width: B, height: H, channels: 3 } }).ensureAlpha().png().toBuffer();
    const uit = await kleineChatFoto(dicht, "image/png");
    expect(uit).not.toBeNull();
    expect((await sharp(Buffer.from(uit as Uint8Array)).metadata()).format).toBe("jpeg");
  });

  it("GIF, geen afbeelding of een ander type: null, en dan geeft de route het origineel (nooit een lege bubbel)", async () => {
    const gif = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#888" } }).gif().toBuffer();
    expect(await kleineChatFoto(gif, "image/gif")).toBeNull();
    expect(await kleineChatFoto(new TextEncoder().encode("geen foto"), "image/jpeg")).toBeNull();
    expect(await kleineChatFoto(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).toBeNull();
  });

  it("hooguit twee tegelijk: de rest wacht op zijn beurt en krijgt toch een kleine versie", async () => {
    const foto = await sharp(nepfoto(), { raw: { width: B, height: H, channels: 3 } }).jpeg({ quality: 82 }).toBuffer();
    const bezig = Array.from({ length: 5 }, () => kleineChatFoto(foto, "image/jpeg", 60_000));
    const r = rij.__zfChatFotoKlein!;
    expect(r.bezig).toBe(KLEIN_TEGELIJK);
    expect(r.wachtend).toHaveLength(5 - KLEIN_TEGELIJK);
    const uit = await Promise.all(bezig);
    expect(uit.every((u) => u !== null)).toBe(true);
    expect(r.bezig).toBe(0);
    expect(r.wachtend).toHaveLength(0);
  });

  it("te lang op zijn beurt gewacht: het origineel, en komt de beurt later toch, dan gaat hij meteen door", async () => {
    const r = { bezig: KLEIN_TEGELIJK, wachtend: [] as Array<() => void> };
    rij.__zfChatFotoKlein = r;
    const foto = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#456" } }).jpeg().toBuffer();
    expect(await kleineChatFoto(foto, "image/jpeg", 30)).toBeNull();
    expect(r.wachtend).toHaveLength(1);
    // een verkleining die nog liep is klaar: de wachtende krijgt de beurt, slaat het werk over en geeft hem door
    r.bezig--;
    r.wachtend.shift()?.();
    await new Promise((klaar) => setTimeout(klaar, 10));
    expect(r.bezig).toBe(KLEIN_TEGELIJK - 1);
  });
});

describe("waar de kleine versie gebruikt wordt", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("de route maakt hem pas na dezelfde toegangscontrole, alleen in de pagina, en houdt de cache privé", () => {
    const route = lees("app/api/inbox/[threadId]/media/[mediaId]/route.ts");
    const toegang = route.indexOf("canAccess(thread, p.userId, admin)");
    const bijlage = route.indexOf("readChatMedia(thread.id, params.mediaId, p.userId)");
    const klein = route.indexOf("kleineChatFoto(file.bytes, file.mimeType)");
    expect(toegang).toBeGreaterThan(-1);
    expect(bijlage).toBeGreaterThan(toegang);
    expect(klein).toBeGreaterThan(bijlage);
    expect(route).toContain('const kleintje = inline && zoek.get("klein") === "1" ? await kleineChatFoto(file.bytes, file.mimeType) : null;');
    expect(route).toContain('"Cache-Control": "private, max-age=86400"');
    expect(route).not.toMatch(/public,|s-maxage/);
  });

  it("alleen de foto in de bubbel laadt klein; een tik, de losse link en downloaden geven het origineel", () => {
    const bubbel = lees("components/chat/MessageBubble.tsx");
    const img = '<img src={`${mediaUrl}?klein=1`} alt={m.attachment?.filename ?? ""} loading="lazy" className="max-h-72 min-h-[6rem] min-w-[8rem] bg-black/5 object-cover" />';
    expect(bubbel.split(img).length - 1).toBe(2);
    expect(bubbel).not.toContain("<img src={mediaUrl}");
    expect(bubbel).toContain("onClick={() => onOpenImage(mediaUrl, ");
    expect(bubbel).toContain('<a href={mediaUrl} target="_blank"');
    expect(bubbel).toContain("<a href={`${mediaUrl}?dl=1`}");
  });
});
