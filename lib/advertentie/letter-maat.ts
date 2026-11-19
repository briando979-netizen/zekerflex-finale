// ---------------------------------------------------------------------------
// De breedte van een tekst in een lettertype, uit het TTF-bestand zelf gelezen
// (cmap + hmtx). Daarmee kan een logo zijn vormen precies om het woord leggen
// (een baan eromheen, een lijn zo breed als de naam) in plaats van te schatten.
// Puur rekenwerk op een Buffer; geen kerning (voor koppen ruim nauwkeurig genoeg).
// Ook de tekenset komt hieruit: een teken dat een sierletter niet heeft, tekent
// satori met een van de basisletters, nooit met een lettertype van buiten.
// ---------------------------------------------------------------------------

export interface LetterMaten {
  /** breedte van één teken als deel van de lettergrootte; undefined = het teken zit niet in dit lettertype */
  breedte: (codepunt: number) => number | undefined;
  tekens: Set<number>;
}

function tabel(buf: Buffer, naam: string): number {
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) if (buf.toString("ascii", 12 + i * 16, 16 + i * 16) === naam) return buf.readUInt32BE(12 + i * 16 + 8);
  throw new Error(`lettertype zonder tabel ${naam}`);
}

/** Teken naar glyph, uit de cmap (format 4 en 12). */
function glyphs(buf: Buffer): Map<number, number> {
  const cmap = tabel(buf, "cmap");
  const map = new Map<number, number>();
  const aantal = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < aantal; i++) {
    const off = cmap + buf.readUInt32BE(cmap + 4 + i * 8 + 4);
    const fmt = buf.readUInt16BE(off);
    if (fmt === 4) {
      const seg = buf.readUInt16BE(off + 6) / 2;
      const eind = off + 14;
      const start = eind + seg * 2 + 2;
      const delta = start + seg * 2;
      const bereik = delta + seg * 2;
      for (let s = 0; s < seg; s++) {
        const e = buf.readUInt16BE(eind + s * 2);
        const b = buf.readUInt16BE(start + s * 2);
        const d = buf.readInt16BE(delta + s * 2);
        const r = buf.readUInt16BE(bereik + s * 2);
        for (let c = b; c <= e && c !== 0xffff; c++) {
          let g: number;
          if (r === 0) g = (c + d) & 0xffff;
          else {
            const v = buf.readUInt16BE(bereik + s * 2 + r + (c - b) * 2);
            g = v === 0 ? 0 : (v + d) & 0xffff;
          }
          if (g !== 0 && !map.has(c)) map.set(c, g);
        }
      }
    } else if (fmt === 12) {
      const groepen = buf.readUInt32BE(off + 12);
      for (let g = 0; g < groepen; g++) {
        const b = buf.readUInt32BE(off + 16 + g * 12);
        const e = buf.readUInt32BE(off + 20 + g * 12);
        const eerste = buf.readUInt32BE(off + 24 + g * 12);
        for (let c = b; c <= e; c++) if (!map.has(c)) map.set(c, eerste + (c - b));
      }
    }
  }
  return map;
}

export function leesLetterMaten(buf: Buffer): LetterMaten {
  const em = buf.readUInt16BE(tabel(buf, "head") + 18);
  const aantal = buf.readUInt16BE(tabel(buf, "hhea") + 34);
  const hmtx = tabel(buf, "hmtx");
  const map = glyphs(buf);
  const breedte = (c: number): number | undefined => {
    const g = map.get(c);
    if (g === undefined) return undefined;
    return buf.readUInt16BE(hmtx + Math.min(g, aantal - 1) * 4) / em;
  };
  return { breedte, tekens: new Set(map.keys()) };
}

/** Meet een tekst: (lettertype, tekst) → breedte als deel van de lettergrootte, zonder letterafstand. */
export type Meter = (lettertype: string, tekst: string) => number;

/** Een meter over meerdere lettertypes; een teken dat ontbreekt telt als een gemiddelde letter (0,6). */
export function maakMeter(maten: Record<string, LetterMaten | undefined>): Meter {
  return (lettertype, tekst) => {
    const m = maten[lettertype];
    let som = 0;
    for (const teken of tekst) som += m?.breedte(teken.codePointAt(0) ?? 0) ?? 0.6;
    return som;
  };
}

/** Voor tests en plekken zonder lettertypebestanden: elk teken even breed. */
export const schatMeter: Meter = (_lettertype, tekst) => [...tekst].length * 0.6;
