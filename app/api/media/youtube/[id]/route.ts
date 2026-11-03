import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { importRemoteImage } from "@/lib/media/clean-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/media/youtube/<id> — our own copy of a YouTube thumbnail, for the
// click-to-play video (components/ui/YouTubeEmbed.tsx). Fetched once from
// i.ytimg.com through the SSRF-safe fetcher, re-encoded (no metadata), kept on
// disk; img-src stays 'self' and visitors never load anything from Google
// until they press play. Only YouTube ids, only that one host: no open proxy.
// ---------------------------------------------------------------------------

const DIR = process.env.YOUTUBE_THUMB_DIR || path.join(process.cwd(), "storage", "youtube-thumbs");
const ID = /^[A-Za-z0-9_-]{11}$/;

const image = (bytes: Buffer) =>
  new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=2592000, immutable", "X-Content-Type-Options": "nosniff" } });
const missing = () => new Response("Geen voorbeeldplaatje.", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id)) return missing();
  const file = path.join(DIR, `${id}.webp`);
  try {
    return image(await readFile(file));
  } catch {
    /* nog niet bewaard: ophalen */
  }
  try {
    await enforceRateLimit({ name: "youtube-thumb", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 30, windowSeconds: 600, message: "Even geduld." });
  } catch {
    return new Response("Te veel verzoeken.", { status: 429 });
  }
  try {
    const thumb = await importRemoteImage(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    await mkdir(DIR, { recursive: true });
    await writeFile(file, thumb.bytes);
    return image(thumb.bytes);
  } catch (err) {
    logger.warn("youtube thumbnail failed", { id, err: String(err) });
    return missing();
  }
}
