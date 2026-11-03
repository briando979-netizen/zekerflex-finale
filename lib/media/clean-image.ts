import sharp from "sharp";
import { AppError } from "@/lib/errors";
import { FetchError, fetchResource } from "@/lib/website-check/fetch";

// ---------------------------------------------------------------------------
// Photos from anywhere, shown from our own origin. ZekerFlex keeps
// img-src 'self': loading a stranger's photo would hand every visitor's IP to
// that server (AVG), slow the page down and break when the source deletes it.
// So an outside photo is fetched once (SSRF-safe: public http(s) only, every
// redirect re-checked, size and time capped), and every photo — uploaded or
// fetched — is decoded, turned upright, stripped of EXIF/GPS, capped in size
// and stored as WebP. SVG never: it can carry script.
// ---------------------------------------------------------------------------

export const IMAGE_MAX_INPUT_BYTES = 15_000_000;
export const IMAGE_MAX_PX = 2400;
/** Photos for a customer's website (lib/sites): sharp on a 4K screen; the site also gets a SITE_IMAGE_SMALL_PX copy for phones. */
export const SITE_IMAGE_MAX_PX = 3840;
export const SITE_IMAGE_SMALL_PX = 1600;

const RASTER = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export interface CleanImage {
  bytes: Buffer;
  width: number;
  height: number;
  mime: "image/webp";
}

/** Any photo → upright, no metadata, at most IMAGE_MAX_PX on the long side, WebP. */
export async function cleanImage(input: Buffer, maxPx = IMAGE_MAX_PX): Promise<CleanImage> {
  if (input.length === 0) throw AppError.validation("Dit bestand is leeg.");
  if (input.length > IMAGE_MAX_INPUT_BYTES) throw AppError.validation("Deze foto is groter dan 15 MB.");
  let format: string | undefined;
  try {
    format = (await sharp(input, { failOn: "error", limitInputPixels: 60_000_000 }).metadata()).format;
  } catch {
    throw AppError.validation("Dit bestand is geen foto die we kunnen lezen.");
  }
  if (!format || !RASTER.has(format)) {
    throw AppError.validation(format === "svg" ? "SVG-bestanden nemen we niet over; gebruik een JPG, PNG of WebP." : "Dit bestand is geen foto die we kunnen lezen.");
  }
  const out = await sharp(input, { failOn: "error", limitInputPixels: 60_000_000, animated: false })
    .rotate()
    .resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: out.data, width: out.info.width, height: out.info.height, mime: "image/webp" };
}

/** Fetch a photo from someone's web address and clean it, so it can be served from our own origin. */
export async function importRemoteImage(url: string): Promise<CleanImage & { sourceUrl: string }> {
  let res: Awaited<ReturnType<typeof fetchResource>>;
  try {
    res = await fetchResource(url.trim(), { maxBytes: IMAGE_MAX_INPUT_BYTES, timeoutMs: 15_000 });
  } catch (err) {
    if (err instanceof FetchError) throw AppError.validation(err.message);
    throw err;
  }
  if (res.status !== 200) throw AppError.validation(`De foto kon niet worden opgehaald: die website antwoordde met code ${res.status}.`);
  if (res.truncated) throw AppError.validation("Deze foto is groter dan 15 MB.");
  const type = (res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  if (type.startsWith("text/html")) {
    throw AppError.validation("Op dit adres staat een webpagina, geen foto. Klik met de rechtermuisknop op de foto en kies 'Afbeeldingsadres kopiëren'.");
  }
  if (type === "image/svg+xml") throw AppError.validation("SVG-bestanden nemen we niet over; gebruik een JPG, PNG of WebP.");
  return { ...(await cleanImage(res.data)), sourceUrl: res.finalUrl };
}
