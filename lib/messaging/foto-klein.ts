import sharp from "sharp";

// ---------------------------------------------------------------------------
// Een kleine versie van een chatfoto voor de bubbel (13 nov 2026). Gemeten in het toegangslog (12 nov): bij het
// openen van een gesprek laadde de chat 10 foto's op volle grootte (0,75–2,3 MB, samen ±14 MB) en duurde elke foto
// 8–11 s, terwijl de bubbel hem hooguit 288 css-px hoog toont (max-h-72). De kleine versie is hooguit KLEIN_ZIJDE px
// aan de langste kant: ook op een telefoon met driedubbele dichtheid scherp (288 × 3 = 864). Een tik op de foto
// opent nog altijd het origineel, en downloaden ook. Niets wordt bewaard.
//
// Wat hetzelfde moet blijven, blijft het origineel: bewegende beelden (GIF, geanimeerde webp), een png met echte
// doorzichtigheid (JPEG kent dat niet) en alles wat niet kleiner wordt. Een lege bubbel komt nooit voor: lukt het
// niet, is het te druk of duurt het te lang, dan het origineel.
// ---------------------------------------------------------------------------

export const KLEIN_ZIJDE = 1080;
/** Hooguit zoveel verkleiningen tegelijk; de rest wacht op zijn beurt (een gesprek met 30 foto's trekt de server niet vol). */
export const KLEIN_TEGELIJK = 2;
/** Zo lang mag één kleine versie duren, wachten op de beurt meegeteld; daarna het origineel. */
export const KLEIN_TIJD_MS = 3_000;
const MAX_PIXELS = 40_000_000;

/** Kan van dit type een kleine versie bestaan? (dezelfde typen die cleanPhoto opnieuw opslaat) */
export const magKlein = (mime: string): boolean => /^image\/(jpeg|png|webp)$/.test(mime);

async function verklein(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const opties = { failOn: "error", limitInputPixels: MAX_PIXELS } as const;
    const meta = await sharp(bytes, opties).metadata();
    if ((meta.pages ?? 1) > 1) return null; // beweegt
    if (meta.hasAlpha && !(await sharp(bytes, opties).stats()).isOpaque) return null; // echt doorzichtig
    // eerst rechtop volgens de EXIF, dan pas zonder metadata: anders staat een telefoonfoto op zijn kant
    const uit = await sharp(bytes, opties)
      .rotate()
      .resize({ width: KLEIN_ZIJDE, height: KLEIN_ZIJDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return uit.length < bytes.length ? new Uint8Array(uit) : null;
  } catch {
    return null;
  }
}

// De wachtrij staat op globalThis, net als andere gedeelde staat (aparte bundels per route).
type Rij = { bezig: number; wachtend: Array<() => void> };
const g = globalThis as typeof globalThis & { __zfChatFotoKlein?: Rij };
const rij = (): Rij => (g.__zfChatFotoKlein ??= { bezig: 0, wachtend: [] });

function neemBeurt(): Promise<void> {
  const r = rij();
  if (r.bezig < KLEIN_TEGELIJK) {
    r.bezig++;
    return Promise.resolve();
  }
  return new Promise((klaar) =>
    r.wachtend.push(() => {
      r.bezig++;
      klaar();
    }),
  );
}

function geefBeurt(): void {
  const r = rij();
  r.bezig = Math.max(0, r.bezig - 1);
  r.wachtend.shift()?.();
}

/**
 * De kleine versie, of null: dan geeft de route het origineel. Nooit een fout. Wie te lang op zijn beurt wacht,
 * slaat het verkleinen over (de beurt gaat meteen door naar de volgende).
 */
export async function kleineChatFoto(bytes: Uint8Array, mime: string, tijdMs = KLEIN_TIJD_MS): Promise<Uint8Array | null> {
  if (!magKlein(mime)) return null;
  let opgegeven = false;
  const werk = (async () => {
    await neemBeurt();
    try {
      return opgegeven ? null : await verklein(bytes);
    } finally {
      geefBeurt();
    }
  })();
  let klok: ReturnType<typeof setTimeout> | undefined;
  const teLaat = new Promise<null>((r) => {
    klok = setTimeout(() => r(null), tijdMs);
  });
  try {
    return await Promise.race([werk, teLaat]);
  } finally {
    opgegeven = true;
    if (klok) clearTimeout(klok);
  }
}
