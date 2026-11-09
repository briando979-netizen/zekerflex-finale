// ---------------------------------------------------------------------------
// Kleine CBOR-lezer (RFC 8949), alleen wat WebAuthn nodig heeft: het
// attestationObject, de COSE-sleutel in authenticatorData en de extensies.
// Gehele getallen, byte strings, tekst, arrays, maps en de eenvoudige waarden
// (false/true/null/undefined, floats). Geen onbepaalde lengtes (CTAP2 gebruikt
// die niet) en geen tags: dan liever weigeren dan half lezen.
//
// De invoer komt van buiten (een browser), dus alles is begrensd: lengtes
// moeten binnen de buffer passen, de diepte is beperkt en een getal dat niet
// veilig in een JS-number past wordt geweigerd.
// ---------------------------------------------------------------------------

export type CborWaarde =
  | number
  | string
  | boolean
  | null
  | undefined
  | Buffer
  | CborWaarde[]
  | Map<number | string, CborWaarde>;

export class CborFout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CborFout";
  }
}

const MAX_DIEPTE = 16;
const MAX_ITEMS = 10_000;

/** Lees één CBOR-item vanaf `start`; geeft de waarde en de positie direct erna. */
export function leesCbor(buf: Buffer, start = 0): { waarde: CborWaarde; einde: number } {
  const teller = { items: 0 };
  const { waarde, pos } = leesItem(buf, start, 0, teller);
  return { waarde, einde: pos };
}

/** Lees precies één CBOR-item dat de hele buffer beslaat (niets erachter). */
export function leesCborGeheel(buf: Buffer): CborWaarde {
  const { waarde, einde } = leesCbor(buf, 0);
  if (einde !== buf.length) throw new CborFout("onverwachte bytes na het CBOR-item");
  return waarde;
}

function nodig(buf: Buffer, pos: number, n: number): void {
  if (n < 0 || pos + n > buf.length) throw new CborFout("CBOR-item loopt voorbij het einde");
}

/** Het argument van een kop (aanvullende info 0–27). */
function leesArgument(buf: Buffer, pos: number, info: number): { arg: number; pos: number } {
  if (info < 24) return { arg: info, pos };
  if (info === 24) {
    nodig(buf, pos, 1);
    return { arg: buf.readUInt8(pos), pos: pos + 1 };
  }
  if (info === 25) {
    nodig(buf, pos, 2);
    return { arg: buf.readUInt16BE(pos), pos: pos + 2 };
  }
  if (info === 26) {
    nodig(buf, pos, 4);
    return { arg: buf.readUInt32BE(pos), pos: pos + 4 };
  }
  if (info === 27) {
    nodig(buf, pos, 8);
    const groot = buf.readBigUInt64BE(pos);
    if (groot > BigInt(Number.MAX_SAFE_INTEGER)) throw new CborFout("CBOR-getal te groot");
    return { arg: Number(groot), pos: pos + 8 };
  }
  throw new CborFout(info === 31 ? "onbepaalde CBOR-lengte wordt niet ondersteund" : "ongeldige CBOR-kop");
}

function leesItem(buf: Buffer, start: number, diepte: number, teller: { items: number }): { waarde: CborWaarde; pos: number } {
  if (diepte > MAX_DIEPTE) throw new CborFout("CBOR te diep genest");
  if (++teller.items > MAX_ITEMS) throw new CborFout("CBOR heeft te veel onderdelen");
  nodig(buf, start, 1);
  const kop = buf.readUInt8(start);
  const soort = kop >> 5;
  const info = kop & 0x1f;
  let pos = start + 1;

  if (soort === 7) {
    // eenvoudige waarden en floats
    if (info === 20) return { waarde: false, pos };
    if (info === 21) return { waarde: true, pos };
    if (info === 22) return { waarde: null, pos };
    if (info === 23) return { waarde: undefined, pos };
    if (info === 25) {
      nodig(buf, pos, 2);
      return { waarde: halfNaarGetal(buf.readUInt16BE(pos)), pos: pos + 2 };
    }
    if (info === 26) {
      nodig(buf, pos, 4);
      return { waarde: buf.readFloatBE(pos), pos: pos + 4 };
    }
    if (info === 27) {
      nodig(buf, pos, 8);
      return { waarde: buf.readDoubleBE(pos), pos: pos + 8 };
    }
    throw new CborFout("onbekende eenvoudige CBOR-waarde");
  }

  const a = leesArgument(buf, pos, info);
  pos = a.pos;
  const arg = a.arg;

  switch (soort) {
    case 0:
      return { waarde: arg, pos };
    case 1:
      return { waarde: -1 - arg, pos };
    case 2: {
      nodig(buf, pos, arg);
      return { waarde: Buffer.from(buf.subarray(pos, pos + arg)), pos: pos + arg };
    }
    case 3: {
      nodig(buf, pos, arg);
      const tekst = new TextDecoder("utf-8", { fatal: true });
      try {
        return { waarde: tekst.decode(buf.subarray(pos, pos + arg)), pos: pos + arg };
      } catch {
        throw new CborFout("ongeldige UTF-8 in CBOR-tekst");
      }
    }
    case 4: {
      // elk item is minstens één byte: een lengte groter dan de rest kan niet kloppen
      if (arg > buf.length - pos) throw new CborFout("CBOR-array loopt voorbij het einde");
      const lijst: CborWaarde[] = [];
      for (let i = 0; i < arg; i++) {
        const r = leesItem(buf, pos, diepte + 1, teller);
        lijst.push(r.waarde);
        pos = r.pos;
      }
      return { waarde: lijst, pos };
    }
    case 5: {
      if (arg * 2 > buf.length - pos) throw new CborFout("CBOR-map loopt voorbij het einde");
      const map = new Map<number | string, CborWaarde>();
      for (let i = 0; i < arg; i++) {
        const k = leesItem(buf, pos, diepte + 1, teller);
        if (typeof k.waarde !== "number" && typeof k.waarde !== "string") throw new CborFout("CBOR-mapsleutel moet een getal of tekst zijn");
        if (map.has(k.waarde)) throw new CborFout("dubbele CBOR-mapsleutel");
        const v = leesItem(buf, k.pos, diepte + 1, teller);
        map.set(k.waarde, v.waarde);
        pos = v.pos;
      }
      return { waarde: map, pos };
    }
    default:
      // soort 6: tags komen in WebAuthn niet voor
      throw new CborFout("CBOR-tags worden niet ondersteund");
  }
}

function halfNaarGetal(h: number): number {
  const teken = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return teken * 2 ** -14 * (mant / 1024);
  if (exp === 31) return mant ? NaN : teken * Infinity;
  return teken * 2 ** (exp - 15) * (1 + mant / 1024);
}

/** Een CBOR-map, of een fout als het iets anders is. */
export function alsMap(w: CborWaarde, wat: string): Map<number | string, CborWaarde> {
  if (!(w instanceof Map)) throw new CborFout(`${wat} is geen CBOR-map`);
  return w;
}
