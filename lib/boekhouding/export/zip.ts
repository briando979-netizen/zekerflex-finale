// ---------------------------------------------------------------------------
// Een heel kleine zip-schrijver (puur, zonder dependency): bestanden worden opgeslagen zonder compressie ("stored"),
// met CRC-32 en UTF-8-bestandsnamen. Genoeg om een paar bestanden voor de accountant in één download te bundelen.
// ---------------------------------------------------------------------------

export interface ZipBestand {
  /** alleen een gewone bestandsnaam, zonder mappen */
  naam: string;
  inhoud: Uint8Array;
}

const TABEL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = (TABEL[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** De tijd 1 januari 1980 00:00 (de vroegste zip-tijd): een vaste waarde houdt de download herhaalbaar. */
const DOS_TIJD = 0;
const DOS_DATUM = (0 << 9) | (1 << 5) | 1;

export function maakZip(bestanden: readonly ZipBestand[]): Uint8Array {
  const enc = new TextEncoder();
  const delen: Uint8Array[] = [];
  const centraal: Uint8Array[] = [];
  let positie = 0;
  const namen = new Set<string>();

  for (const b of bestanden) {
    if (!/^[A-Za-z0-9._-]+$/.test(b.naam) || namen.has(b.naam)) throw new Error("Ongeldige of dubbele bestandsnaam in de zip.");
    namen.add(b.naam);
    const naam = enc.encode(b.naam);
    const crc = crc32(b.inhoud);
    const lokaal = new DataView(new ArrayBuffer(30));
    lokaal.setUint32(0, 0x04034b50, true);
    lokaal.setUint16(4, 20, true);
    lokaal.setUint16(6, 0x0800, true); // bit 11: bestandsnaam is UTF-8
    lokaal.setUint16(8, 0, true); // stored
    lokaal.setUint16(10, DOS_TIJD, true);
    lokaal.setUint16(12, DOS_DATUM, true);
    lokaal.setUint32(14, crc, true);
    lokaal.setUint32(18, b.inhoud.length, true);
    lokaal.setUint32(22, b.inhoud.length, true);
    lokaal.setUint16(26, naam.length, true);
    lokaal.setUint16(28, 0, true);
    delen.push(new Uint8Array(lokaal.buffer), naam, b.inhoud);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, DOS_TIJD, true);
    cd.setUint16(14, DOS_DATUM, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, b.inhoud.length, true);
    cd.setUint32(24, b.inhoud.length, true);
    cd.setUint16(28, naam.length, true);
    cd.setUint32(42, positie, true);
    centraal.push(new Uint8Array(cd.buffer), naam);

    positie += 30 + naam.length + b.inhoud.length;
  }

  const grootteCentraal = centraal.reduce((s, d) => s + d.length, 0);
  const eind = new DataView(new ArrayBuffer(22));
  eind.setUint32(0, 0x06054b50, true);
  eind.setUint16(8, bestanden.length, true);
  eind.setUint16(10, bestanden.length, true);
  eind.setUint32(12, grootteCentraal, true);
  eind.setUint32(16, positie, true);

  const alles = [...delen, ...centraal, new Uint8Array(eind.buffer)];
  const uit = new Uint8Array(alles.reduce((s, d) => s + d.length, 0));
  let o = 0;
  for (const d of alles) {
    uit.set(d, o);
    o += d.length;
  }
  return uit;
}
