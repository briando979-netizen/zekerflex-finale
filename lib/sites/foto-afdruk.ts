import sharp from "sharp";

// ---------------------------------------------------------------------------
// Dezelfde foto herkennen, ook in een andere maat of opnieuw gecomprimeerd:
// veel sites tonen één foto onder twee adressen (klein en groot, of met een
// andere naam). Een nieuwe website uit de gratis check zou die dan twee keer
// tonen, bijvoorbeeld op twee aanbodtegels naast elkaar. De vingerafdruk is
// het gemiddelde van 8×8 grijswaarden (64 bits); bijna gelijk = dezelfde foto.
// ---------------------------------------------------------------------------

/** Hooguit zoveel van de 64 bits mag verschillen om als dezelfde foto te tellen. */
export const ZELFDE_FOTO = 6;

/** De vingerafdruk van een foto; null als hij niet te lezen is. */
export async function fotoAfdruk(bytes: Buffer): Promise<bigint | null> {
  try {
    const px = await sharp(bytes).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
    const gem = px.reduce((s, v) => s + v, 0) / px.length;
    let afdruk = 0n;
    for (const v of px) afdruk = (afdruk << 1n) | (v > gem ? 1n : 0n);
    return afdruk;
  } catch {
    return null;
  }
}

/** Het aantal bits waarin twee vingerafdrukken verschillen. */
export function afdrukVerschil(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/**
 * Van een rij foto's de dubbele eruit (null), in de volgorde van hun site; van een dubbele houden we
 * de grootste, op de plek waar hij het eerst stond. `bron` loopt mee (het adres op hun site).
 */
export async function zonderDubbeleFotos<T extends { bytes: Buffer; width: number; height: number }>(fotos: (T | null)[], bron: (string | undefined)[]): Promise<{ fotos: (T | null)[]; bron: (string | undefined)[] }> {
  const uit = [...fotos];
  const adres = [...bron];
  const gezien: { i: number; afdruk: bigint; px: number }[] = [];
  for (const [i, foto] of fotos.entries()) {
    if (!foto) continue;
    const afdruk = await fotoAfdruk(foto.bytes);
    if (afdruk === null) continue;
    const px = foto.width * foto.height;
    const eerder = gezien.find((g) => afdrukVerschil(g.afdruk, afdruk) <= ZELFDE_FOTO);
    if (!eerder) {
      gezien.push({ i, afdruk, px });
      continue;
    }
    if (px > eerder.px) {
      uit[eerder.i] = foto;
      adres[eerder.i] = adres[i];
      eerder.px = px;
    }
    uit[i] = null;
  }
  return { fotos: uit, bron: adres };
}
