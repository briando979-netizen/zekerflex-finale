import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "@/lib/errors";
import { VIDEO_DIR, bestandItem } from "@/lib/video/bestanden";
import { leesMedia, mediaItem } from "@/lib/ontwerp/media";
import { STOCK_FOTOS } from "@/lib/video/stock";

// Een foto uit de editor (eigen bestand, stockfoto of Site-media) als data:-adres,
// om aan een beeld- of video-AI te geven. Alleen adressen van onze eigen bronnen.

export async function fotoBytes(bron: string): Promise<Buffer> {
  const eigen = /^\/api\/admin\/video\/bestand\/(v[a-z0-9]{10,30})$/.exec(bron);
  if (eigen?.[1]) {
    const item = await bestandItem(eigen[1]);
    if (!item || item.soort !== "foto") throw AppError.validation("Kies een foto.");
    return readFile(path.join(VIDEO_DIR, `${item.id}.${item.ext}`));
  }
  const site = /^\/beeld\/(m[a-z0-9]{10,30})$/.exec(bron);
  if (site?.[1]) {
    const item = await mediaItem(site[1]);
    if (!item || item.soort !== "foto") throw AppError.validation("Kies een foto.");
    return leesMedia(item, false);
  }
  const stock = STOCK_FOTOS.find((f) => f.adres === bron);
  if (stock) return readFile(path.join(process.cwd(), "public", stock.adres));
  throw AppError.validation("Deze foto kan hier niet gebruikt worden.");
}

/** Foto als JPEG, hooguit `maxPx` aan de lange kant. */
export async function fotoJpeg(bron: string, maxPx = 1536): Promise<Buffer> {
  return sharp(await fotoBytes(bron)).rotate().resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
}

/** Foto als JPEG-data:-adres (voor een beeld-AI die base64 wil). */
export async function fotoAlsData(bron: string, maxPx = 1536): Promise<{ dataUrl: string; mime: "image/jpeg" }> {
  const jpeg = await fotoJpeg(bron, maxPx);
  return { dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, mime: "image/jpeg" };
}
