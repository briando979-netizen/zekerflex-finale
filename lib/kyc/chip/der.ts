// ---------------------------------------------------------------------------
// Een kleine DER-lezer (ASN.1, alleen wat de chip van een paspoort of ID-kaart
// nodig heeft): tag, lengte, waarde, de kinderen van een reeks, en een OID als
// tekst. Bewust zonder bibliotheek: de opbouw van de chipbestanden ligt vast
// (ICAO 9303) en zo is alles los te testen. Puur.
// ---------------------------------------------------------------------------

export interface Tlv {
  /** de tag zoals hij in de bytes staat, ook meerbytes (0x5F1F, 0x7F61) */
  tag: number;
  /** samengesteld (bevat zelf weer TLV's) */
  samengesteld: boolean;
  /** de waarde zonder tag en lengte */
  waarde: Buffer;
  /** het hele element, met tag en lengte (nodig voor hashes en handtekeningen) */
  ruw: Buffer;
}

export class DerFout extends Error {}

/** Leest één element vanaf `start`; geeft het element en waar het volgende begint. */
export function leesTlv(buf: Buffer, start = 0): { tlv: Tlv; volgende: number } {
  let p = start;
  if (p >= buf.length) throw new DerFout("einde van de gegevens");
  const eerste = buf[p++]!;
  let tag = eerste;
  if ((eerste & 0x1f) === 0x1f) {
    // meerbytes-tag: doorgaan zolang het hoogste bit staat
    let b: number;
    do {
      if (p >= buf.length) throw new DerFout("tag loopt door tot het einde");
      b = buf[p++]!;
      tag = tag * 256 + b;
    } while (b & 0x80);
  }
  if (p >= buf.length) throw new DerFout("lengte ontbreekt");
  const l0 = buf[p++]!;
  let lengte: number;
  if (l0 < 0x80) lengte = l0;
  else {
    const n = l0 & 0x7f;
    if (n === 0 || n > 4) throw new DerFout("lengte niet ondersteund");
    lengte = 0;
    for (let i = 0; i < n; i++) {
      if (p >= buf.length) throw new DerFout("lengte loopt door tot het einde");
      lengte = lengte * 256 + buf[p++]!;
    }
  }
  const eind = p + lengte;
  if (eind > buf.length) throw new DerFout("waarde langer dan de gegevens");
  return {
    tlv: { tag, samengesteld: (eerste & 0x20) !== 0, waarde: buf.subarray(p, eind), ruw: buf.subarray(start, eind) },
    volgende: eind,
  };
}

/** Eén element dat de hele buffer beslaat. */
export function leesEen(buf: Buffer): Tlv {
  const { tlv, volgende } = leesTlv(buf, 0);
  if (volgende !== buf.length) throw new DerFout("gegevens na het element");
  return tlv;
}

/** De kinderen van een samengesteld element (SEQUENCE, SET, [n]). */
export function kinderen(t: Tlv): Tlv[] {
  const uit: Tlv[] = [];
  let p = 0;
  while (p < t.waarde.length) {
    const { tlv, volgende } = leesTlv(t.waarde, p);
    uit.push(tlv);
    p = volgende;
  }
  return uit;
}

/** Het n-de kind, of een fout met uitleg. */
export function kind(t: Tlv, n: number, verwacht?: number): Tlv {
  const k = kinderen(t)[n];
  if (!k) throw new DerFout(`element ${n} ontbreekt`);
  if (verwacht !== undefined && k.tag !== verwacht) throw new DerFout(`element ${n}: tag ${k.tag.toString(16)} in plaats van ${verwacht.toString(16)}`);
  return k;
}

/** OBJECT IDENTIFIER → "1.2.840.113549.1.7.2". */
export function oid(t: Tlv): string {
  if (t.tag !== 0x06) throw new DerFout("geen OID");
  const b = t.waarde;
  if (b.length === 0) throw new DerFout("lege OID");
  const delen: number[] = [];
  const eerste = b[0]!;
  delen.push(eerste < 80 ? Math.floor(eerste / 40) : 2, eerste < 80 ? eerste % 40 : eerste - 80);
  let waarde = 0;
  for (let i = 1; i < b.length; i++) {
    waarde = waarde * 128 + (b[i]! & 0x7f);
    if (!(b[i]! & 0x80)) {
      delen.push(waarde);
      waarde = 0;
    }
  }
  return delen.join(".");
}

/** INTEGER (klein genoeg voor een getal: versies, datagroepnummers, zoutlengte). */
export function geheelGetal(t: Tlv): number {
  if (t.tag !== 0x02) throw new DerFout("geen INTEGER");
  let n = 0;
  for (const b of t.waarde) n = n * 256 + b;
  return n;
}

export const TAG = {
  INTEGER: 0x02,
  OCTET_STRING: 0x04,
  OID: 0x06,
  SEQUENCE: 0x30,
  SET: 0x31,
  /** [0] samengesteld */
  CTX0: 0xa0,
  CTX1: 0xa1,
  CTX2: 0xa2,
} as const;
