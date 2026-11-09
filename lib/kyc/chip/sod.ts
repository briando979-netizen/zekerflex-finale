// ---------------------------------------------------------------------------
// Passieve authenticatie van de chip in een paspoort of ID-kaart (ICAO 9303-10
// en -11). Het "Document Security Object" (EF.SOD) bevat de hashes van de
// datagroepen (DG1 = de MRZ, DG2 = de pasfoto), ondertekend door een Document
// Signer (DS) van de uitgevende overheid; dat DS-certificaat is weer ondertekend
// door de CSCA van dat land. Drie schakels, drie controles:
//   1. de gelezen datagroepen hebben precies de hash uit het SOD
//   2. de handtekening op het SOD klopt met het DS-certificaat
//   3. het DS-certificaat is uitgegeven door een vertrouwde CSCA (lib/kyc/chip/csca.ts)
//   4. DS- en CSCA-certificaat zijn nu geldig (ICAO 9303-12: de geldigheid van
//      een DS-certificaat dekt de looptijd van de documenten die ermee zijn
//      ondertekend, dus een geldig document heeft een geldig DS-certificaat)
// Klopt alles, dan staan de gegevens echt zo op een echte chip van die overheid.
// ---------------------------------------------------------------------------

import { constants, createHash, timingSafeEqual, verify as cryptoVerify, X509Certificate } from "node:crypto";
import { DerFout, geheelGetal, kind, kinderen, leesEen, oid, TAG, type Tlv } from "@/lib/kyc/chip/der";

const HASH: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.4": "sha224",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

type Soort = "rsa" | "rsa-pss" | "ecdsa";
const HANDTEKENING: Record<string, { soort: Soort; hash?: string }> = {
  "1.2.840.113549.1.1.1": { soort: "rsa" }, // rsaEncryption: de hash volgt uit digestAlgorithm
  "1.2.840.113549.1.1.5": { soort: "rsa", hash: "sha1" },
  "1.2.840.113549.1.1.14": { soort: "rsa", hash: "sha224" },
  "1.2.840.113549.1.1.11": { soort: "rsa", hash: "sha256" },
  "1.2.840.113549.1.1.12": { soort: "rsa", hash: "sha384" },
  "1.2.840.113549.1.1.13": { soort: "rsa", hash: "sha512" },
  "1.2.840.113549.1.1.10": { soort: "rsa-pss" },
  "1.2.840.10045.4.1": { soort: "ecdsa", hash: "sha1" },
  "1.2.840.10045.4.3.1": { soort: "ecdsa", hash: "sha224" },
  "1.2.840.10045.4.3.2": { soort: "ecdsa", hash: "sha256" },
  "1.2.840.10045.4.3.3": { soort: "ecdsa", hash: "sha384" },
  "1.2.840.10045.4.3.4": { soort: "ecdsa", hash: "sha512" },
};

const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";

export interface Sod {
  /** hash per datagroepnummer, zoals de overheid ze ondertekende */
  hashes: Map<number, Buffer>;
  hashAlgoritme: string;
  eContent: Buffer;
  digestAlgoritme: string;
  /** de ondertekende attributen, ruw (tag [0]); null als de handtekening direct over eContent gaat */
  signedAttrs: Tlv | null;
  handtekening: { soort: Soort; hash: string; zout?: number; waarde: Buffer };
  dsCertificaat: X509Certificate | null;
}

function hashVan(algId: Tlv): string {
  const naam = HASH[oid(kind(algId, 0, TAG.OID))];
  if (!naam) throw new DerFout("onbekend hash-algoritme");
  return naam;
}

/** RSASSA-PSS-parameters: [0] hash (standaard sha1), [2] zoutlengte (standaard 20). */
function pssParameters(algId: Tlv): { hash: string; zout: number } {
  const params = kinderen(algId)[1];
  let hash = "sha1";
  let zout = 20;
  if (params && params.tag === TAG.SEQUENCE) {
    for (const k of kinderen(params)) {
      if (k.tag === TAG.CTX0) hash = hashVan(kind(k, 0, TAG.SEQUENCE));
      if (k.tag === TAG.CTX2) zout = geheelGetal(kind(k, 0, TAG.INTEGER));
    }
  }
  return { hash, zout };
}

/** Leest het SOD (met of zonder de buitenste tag 0x77). Gooit DerFout bij een kapotte opbouw. */
export function leesSod(bytes: Buffer): Sod {
  let top = leesEen(bytes);
  if (top.tag === 0x77) top = leesEen(top.waarde);
  if (top.tag !== TAG.SEQUENCE || oid(kind(top, 0, TAG.OID)) !== OID_SIGNED_DATA) throw new DerFout("geen SignedData");
  const sd = kind(kind(top, 1, TAG.CTX0), 0, TAG.SEQUENCE);
  const delen = kinderen(sd);

  const encap = delen[2];
  if (!encap || encap.tag !== TAG.SEQUENCE) throw new DerFout("encapContentInfo ontbreekt");
  const eContent = kind(kind(encap, 1, TAG.CTX0), 0, TAG.OCTET_STRING).waarde;

  // LDSSecurityObject: versie, hash-algoritme, de hashes per datagroep
  const lds = leesEen(eContent);
  const hashAlgoritme = hashVan(kind(lds, 1, TAG.SEQUENCE));
  const hashes = new Map<number, Buffer>();
  for (const dg of kinderen(kind(lds, 2, TAG.SEQUENCE))) {
    hashes.set(geheelGetal(kind(dg, 0, TAG.INTEGER)), kind(dg, 1, TAG.OCTET_STRING).waarde);
  }

  const certs = delen.find((d, i) => i > 2 && d.tag === TAG.CTX0);
  const signerInfos = delen[delen.length - 1];
  if (!signerInfos || signerInfos.tag !== TAG.SET) throw new DerFout("signerInfos ontbreekt");
  const si = kind(signerInfos, 0, TAG.SEQUENCE);
  const siDelen = kinderen(si);
  const digestAlgoritme = hashVan(siDelen[2] ?? kind(si, 2));
  let p = 3;
  let signedAttrs: Tlv | null = null;
  if (siDelen[p]?.tag === TAG.CTX0) signedAttrs = siDelen[p++]!;
  const sigAlg = siDelen[p++];
  const sigWaarde = siDelen[p];
  if (!sigAlg || !sigWaarde || sigWaarde.tag !== TAG.OCTET_STRING) throw new DerFout("handtekening ontbreekt");
  const algOid = oid(kind(sigAlg, 0, TAG.OID));
  const alg = HANDTEKENING[algOid];
  if (!alg) throw new DerFout(`onbekend handtekeningalgoritme ${algOid}`);
  const handtekening =
    alg.soort === "rsa-pss"
      ? { soort: alg.soort, ...pssParameters(sigAlg), waarde: sigWaarde.waarde }
      : { soort: alg.soort, hash: alg.hash ?? digestAlgoritme, waarde: sigWaarde.waarde };

  let dsCertificaat: X509Certificate | null = null;
  const eerste = certs ? kinderen(certs)[0] : undefined;
  if (eerste) dsCertificaat = new X509Certificate(eerste.ruw);

  return { hashes, hashAlgoritme, eContent, digestAlgoritme, signedAttrs, handtekening, dsCertificaat };
}

const gelijk = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** Is het certificaat op dit moment geldig (niet vóór validFrom, niet na validTo)? */
export function geldigOp(cert: X509Certificate, nu: Date): boolean {
  const van = new Date(cert.validFrom).getTime();
  const tot = new Date(cert.validTo).getTime();
  return Number.isFinite(van) && Number.isFinite(tot) && van <= nu.getTime() && nu.getTime() <= tot;
}

/** Klopt de handtekening op het SOD met dit certificaat? */
function handtekeningKlopt(sod: Sod, cert: X509Certificate): boolean {
  let data = sod.eContent;
  if (sod.signedAttrs) {
    // het messageDigest-attribuut moet de hash van eContent zijn
    const verwacht = createHash(sod.digestAlgoritme).update(sod.eContent).digest();
    const md = kinderen(sod.signedAttrs).find((a) => oid(kind(a, 0, TAG.OID)) === OID_MESSAGE_DIGEST);
    if (!md || !gelijk(kind(kind(md, 1, TAG.SET), 0, TAG.OCTET_STRING).waarde, verwacht)) return false;
    // ondertekend is de DER van de attributen als SET (0x31), niet met de impliciete tag [0]
    data = Buffer.from(sod.signedAttrs.ruw);
    data[0] = TAG.SET;
  }
  const h = sod.handtekening;
  if (h.soort === "rsa-pss") {
    return cryptoVerify(h.hash, data, { key: cert.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: h.zout ?? 20 }, h.waarde);
  }
  return cryptoVerify(h.hash, data, cert.publicKey, h.waarde);
}

/** Het land uit het onderwerp van een certificaat ("C=NL"). */
export function landVan(cert: X509Certificate): string | null {
  return /(?:^|\n)C=([A-Z]{2,3})(?:\n|$)/.exec(cert.subject)?.[1] ?? null;
}

export interface SodControle {
  /** het SOD is te lezen */
  gelezen: boolean;
  /** elke meegestuurde datagroep heeft precies de ondertekende hash (en DG1 is er) */
  hashesOk: boolean;
  /** de handtekening op het SOD klopt met het DS-certificaat */
  handtekeningOk: boolean;
  /** het DS-certificaat komt van een vertrouwde CSCA; null = geen CSCA van dit land bekend */
  ketenOk: boolean | null;
  /** het DS-certificaat en de CSCA die hem uitgaf zijn op dit moment geldig */
  geldigOk: boolean;
  land: string | null;
  fouten: string[];
}

/**
 * De passieve authenticatie: datagroepen (ruwe bestanden zoals van de chip
 * gelezen, met tag en lengte) tegen het SOD, en het SOD tegen de CSCA's.
 */
export function controleerSod(sodBytes: Buffer, groepen: Record<number, Buffer>, csca: X509Certificate[], nu: Date = new Date()): SodControle {
  const uit: SodControle = { gelezen: false, hashesOk: false, handtekeningOk: false, ketenOk: null, geldigOk: false, land: null, fouten: [] };
  let sod: Sod;
  try {
    sod = leesSod(sodBytes);
    uit.gelezen = true;
  } catch (err) {
    uit.fouten.push(`Het zegel van de chip is niet te lezen (${(err as Error).message})`);
    return uit;
  }

  // 1. hashes
  const nummers = Object.keys(groepen).map(Number);
  uit.hashesOk = nummers.includes(1) && nummers.every((n) => {
    const verwacht = sod.hashes.get(n);
    if (!verwacht) {
      uit.fouten.push(`Datagroep ${n} staat niet in het zegel`);
      return false;
    }
    const ok = gelijk(createHash(sod.hashAlgoritme).update(groepen[n]!).digest(), verwacht);
    if (!ok) uit.fouten.push(`Datagroep ${n} wijkt af van wat de overheid ondertekende`);
    return ok;
  });

  // 2. handtekening
  const ds = sod.dsCertificaat;
  if (!ds) {
    uit.fouten.push("Het zegel bevat geen certificaat van de ondertekenaar");
    return uit;
  }
  uit.land = landVan(ds);
  try {
    uit.handtekeningOk = handtekeningKlopt(sod, ds);
  } catch (err) {
    uit.fouten.push(`De handtekening is niet te controleren (${(err as Error).message})`);
  }
  if (!uit.handtekeningOk && !uit.fouten.some((f) => f.startsWith("De handtekening"))) uit.fouten.push("De handtekening op het zegel klopt niet");

  // 3. keten naar een vertrouwde CSCA (van hetzelfde land en dezelfde uitgever)
  const kandidaten = csca.filter((c) => {
    try {
      return ds.checkIssued(c);
    } catch {
      return false;
    }
  });
  if (kandidaten.length === 0) {
    uit.ketenOk = null;
    uit.fouten.push(`Geen vertrouwd overheidscertificaat (CSCA) bekend voor ${uit.land ?? "dit land"}`);
  } else {
    const uitgever = kandidaten.find((c) => {
      try {
        return ds.verify(c.publicKey);
      } catch {
        return false;
      }
    });
    uit.ketenOk = uitgever !== undefined;
    if (!uitgever) uit.fouten.push("De ondertekenaar is niet door de overheid van dit land uitgegeven");
    // 4. geldigheid nu, van de ondertekenaar en van de CSCA die hem uitgaf
    if (uitgever) {
      uit.geldigOk = geldigOp(ds, nu) && geldigOp(uitgever, nu);
      if (!uit.geldigOk) uit.fouten.push("Het certificaat van de ondertekenaar of van de overheid is verlopen of nog niet geldig");
    }
  }
  return uit;
}
