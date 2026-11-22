import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { GRENZEN, fotoSoort } from "@/lib/community/regels";

// ---------------------------------------------------------------------------
// De foto's van de community. Op het opslagvolume (storage/community, volume app-storage), nooit in public/: de container
// wordt bij elke uitrol vervangen (AGENTS.md). Elke foto wordt opnieuw gemaakt met sharp (lib/media/clean-image.ts):
// rechtop, hooguit 1600 px, WebP en zonder EXIF of GPS. Dat laatste is verplicht: een telefoonfoto draagt anders de plek
// waar hij is gemaakt mee naar een openbare pagina. Geserveerd via /api/community/foto/<onderwerp>/<foto>.webp.
// sharp laden we pas bij het maken, zodat het wissen (lib/community/avg.ts) het niet nodig heeft.
// ---------------------------------------------------------------------------

export const COMMUNITY_DIR = process.env.COMMUNITY_DIR || path.join(process.cwd(), "storage", "community");

export const isFotoId = (id: string): boolean => /^f[a-z0-9]{12,40}$/.test(id);
const bestand = (id: string) => path.join(COMMUNITY_DIR, `${id}.webp`);

/** Controleert de foto (soort aan de eerste bytes, grootte), maakt hem schoon en bewaart hem. Geeft het foto-id. */
export async function maakFoto(bytes: Buffer): Promise<string> {
  if (bytes.length === 0) throw AppError.validation("Deze foto is leeg.");
  if (bytes.length > GRENZEN.fotoBytes) throw AppError.validation("Deze foto is groter dan 8 MB. Kies een kleinere foto.");
  const soort = fotoSoort(bytes);
  if (!soort) throw AppError.validation("Alleen foto's als jpg, png, webp of heic.");
  let schoon: Buffer;
  try {
    const { cleanImage } = await import("@/lib/media/clean-image");
    schoon = (await cleanImage(bytes, GRENZEN.fotoPx)).bytes;
  } catch (err) {
    if (soort === "heic") {
      throw AppError.validation("Deze iPhone-foto (heic) kunnen we niet lezen. Kies hem nog een keer, of zet je camera op Meest compatibel (Instellingen, Camera, Formaten).");
    }
    if (err instanceof AppError) throw err;
    throw AppError.validation("Deze foto kunnen we niet lezen. Probeer een andere.");
  }
  const id = `f${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  await mkdir(COMMUNITY_DIR, { recursive: true });
  await writeFile(bestand(id), schoon);
  return id;
}

export async function leesFoto(id: string): Promise<Buffer | null> {
  if (!isFotoId(id)) return null;
  try {
    return await readFile(bestand(id));
  } catch {
    return null;
  }
}

/** Foto's van schijf; een foto die er al niet meer is, is geen fout. */
export async function wisFotos(ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    if (!isFotoId(id)) continue;
    try {
      await unlink(bestand(id));
      n += 1;
    } catch {
      /* al weg */
    }
  }
  return n;
}
