import { describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign, X509Certificate, type KeyObject } from "node:crypto";
import { controleerChip, mrzUitDg1 } from "@/lib/kyc/chip/chip";
import { certificatenUit } from "@/lib/kyc/chip/csca";
import { controleCijfer } from "@/lib/kyc/mrz";

// vaste "vandaag": geen tijdbom (AGENTS.md)
const NU = new Date("2026-11-09T12:00:00+01:00");

// ---------------------------------------------------------------------------
// Een kleine DER-schrijver, alleen voor deze test: zo bouwen we een echte chip
// na (CSCA → DS-certificaat → SOD over DG1/DG2), zonder sleutels in de repo.
// ---------------------------------------------------------------------------
function lengte(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const b: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) b.unshift(x & 0xff);
  return Buffer.from([0x80 | b.length, ...b]);
}
function tlv(tag: number, ...delen: Buffer[]): Buffer {
  const w = Buffer.concat(delen);
  const t = tag > 0xff ? Buffer.from([tag >> 8, tag & 0xff]) : Buffer.from([tag]);
  return Buffer.concat([t, lengte(w.length), w]);
}
const seq = (...d: Buffer[]) => tlv(0x30, ...d);
const set = (...d: Buffer[]) => tlv(0x31, ...d);
const ctx = (n: number, ...d: Buffer[]) => tlv(0xa0 + n, ...d);
const octet = (b: Buffer) => tlv(0x04, b);
function int(n: number): Buffer {
  const b: number[] = [];
  let x = n;
  do {
    b.unshift(x & 0xff);
    x = Math.floor(x / 256);
  } while (x > 0);
  if (b[0]! & 0x80) b.unshift(0);
  return tlv(0x02, Buffer.from(b));
}
function oid(s: string): Buffer {
  const p = s.split(".").map(Number);
  const b = [p[0]! * 40 + p[1]!];
  for (const n of p.slice(2)) {
    const t = [n & 0x7f];
    for (let x = Math.floor(n / 128); x > 0; x = Math.floor(x / 128)) t.unshift((x & 0x7f) | 0x80);
    b.push(...t);
  }
  return tlv(0x06, Buffer.from(b));
}
const tekst = (s: string) => tlv(0x13, Buffer.from(s, "latin1"));
const tijd = (s: string) => tlv(0x17, Buffer.from(s, "latin1"));
const bits = (b: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));

const SHA256 = "2.16.840.1.101.3.4.2.1";
const LDS = "2.23.136.1.1.1";
const naam = (land: string, cn: string) => seq(set(seq(oid("2.5.4.6"), tekst(land))), set(seq(oid("2.5.4.3"), tekst(cn))));

interface Sleutel {
  privateKey: KeyObject;
  publicKey: KeyObject;
  soort: "ec" | "rsa";
}
function sleutel(soort: "ec" | "rsa" = "ec"): Sleutel {
  const k = soort === "ec" ? generateKeyPairSync("ec", { namedCurve: "prime256v1" }) : generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { privateKey: k.privateKey, publicKey: k.publicKey, soort };
}
const algId = (soort: "ec" | "rsa") => (soort === "ec" ? seq(oid("1.2.840.10045.4.3.2")) : seq(oid("1.2.840.113549.1.1.11"), tlv(0x05, Buffer.alloc(0))));

function certificaat(o: { onderwerp: Buffer; uitgever: Buffer; sleutel: Sleutel; door: Sleutel; serie: number; tot?: string }) {
  const spki = o.sleutel.publicKey.export({ type: "spki", format: "der" });
  const tbs = seq(ctx(0, int(2)), int(o.serie), algId(o.door.soort), o.uitgever, seq(tijd("260101000000Z"), tijd(o.tot ?? "360101000000Z")), o.onderwerp, spki);
  const der = seq(tbs, algId(o.door.soort), bits(sign("sha256", tbs, o.door.privateKey)));
  return { der, x509: new X509Certificate(der) };
}

/** Het SOD: de hashes van de datagroepen, ondertekend door de DS (met signedAttrs, zoals echte documenten). */
function maakSod(o: { groepen: Record<number, Buffer>; ondertekenaar: Sleutel; dsCert: Buffer }): Buffer {
  const h = (b: Buffer) => createHash("sha256").update(b).digest();
  const lds = seq(int(0), seq(oid(SHA256)), seq(...Object.entries(o.groepen).map(([n, b]) => seq(int(Number(n)), octet(h(b))))));
  const attrs = [seq(oid("1.2.840.113549.1.9.3"), set(oid(LDS))), seq(oid("1.2.840.113549.1.9.4"), set(octet(h(lds))))];
  const handtekening = sign("sha256", set(...attrs), o.ondertekenaar.privateKey);
  const signerInfo = seq(int(1), seq(naam("UT", "CSCA Proefland"), int(2)), seq(oid(SHA256)), ctx(0, ...attrs), algId(o.ondertekenaar.soort), octet(handtekening));
  const signedData = seq(int(3), set(seq(oid(SHA256))), seq(oid(LDS), ctx(0, octet(lds))), ctx(0, o.dsCert), set(signerInfo));
  return tlv(0x77, seq(oid("1.2.840.113549.1.7.2"), ctx(0, signedData)));
}

/** Een ID-kaart-MRZ (TD1, 90 tekens) met BSN in het vrije veld en kloppende controlecijfers. */
function kaartMrz(): string {
  const c = (s: string) => String(controleCijfer(s));
  const nummer = "IXA12B3C4";
  const r1 = `I<UTO${nummer}${c(nummer)}999999990`.padEnd(30, "<");
  const kop2 = `030616${c("030616")}M340312${c("340312")}UTO`;
  const vrij2 = "<".repeat(11);
  const r2 = `${kop2}${vrij2}${c(r1.slice(5, 30) + kop2.slice(0, 7) + kop2.slice(8, 15) + vrij2)}`;
  return r1 + r2 + "VAN<ESSEN<<BRIANDO".padEnd(30, "<");
}

const DG1 = tlv(0x61, tlv(0x5f1f, Buffer.from(kaartMrz(), "latin1")));
const DG2 = tlv(0x75, Buffer.from("pasfoto-op-de-chip ".repeat(40), "latin1"));

const cscaSleutel = sleutel();
const CSCA = certificaat({ onderwerp: naam("UT", "CSCA Proefland"), uitgever: naam("UT", "CSCA Proefland"), sleutel: cscaSleutel, door: cscaSleutel, serie: 1 });
const dsSleutel = sleutel();
const DS = certificaat({ onderwerp: naam("UT", "DS Proefland"), uitgever: naam("UT", "CSCA Proefland"), sleutel: dsSleutel, door: cscaSleutel, serie: 2 });
const SOD = maakSod({ groepen: { 1: DG1, 2: DG2 }, ondertekenaar: dsSleutel, dsCert: DS.der });

describe("chip: passieve authenticatie", () => {
  it("een echte chip: hashes, handtekening, keten en geldigheid kloppen", () => {
    const u = controleerChip({ dg1: DG1, dg2: DG2, sod: SOD }, [CSCA.x509], NU);
    expect(u).toMatchObject({ gelezen: true, hashesOk: true, handtekeningOk: true, ketenOk: true, geldigOk: true, land: "UT", echt: true });
    expect(u.fouten).toEqual([]);
    expect(u.mrz).toMatchObject({ documentnummer: "IXA12B3C4", vervaldatum: "2034-03-12", achternaam: "VAN ESSEN", geldig: true });
  });

  it("geeft het BSN uit DG1 nergens terug", () => {
    const u = controleerChip({ dg1: DG1, dg2: DG2, sod: SOD }, [CSCA.x509], NU);
    expect(JSON.stringify(u)).not.toContain("999999990");
  });

  it("een aangepaste naam in DG1 valt door de mand (hash klopt niet)", () => {
    const vals = tlv(0x61, tlv(0x5f1f, Buffer.from(kaartMrz().replace("BRIANDO", "BRIANDA"), "latin1")));
    const u = controleerChip({ dg1: vals, dg2: DG2, sod: SOD }, [CSCA.x509], NU);
    expect(u.hashesOk).toBe(false);
    expect(u.echt).toBe(false);
  });

  it("een verwisselde pasfoto (DG2) valt door de mand", () => {
    const u = controleerChip({ dg1: DG1, dg2: tlv(0x75, Buffer.from("andere foto")), sod: SOD }, [CSCA.x509], NU);
    expect(u.hashesOk).toBe(false);
    expect(u.echt).toBe(false);
  });

  it("een zelfgemaakte 'overheid' met dezelfde naam: de keten klopt niet", () => {
    const nepSleutel = sleutel();
    const nepCsca = certificaat({ onderwerp: naam("UT", "CSCA Proefland"), uitgever: naam("UT", "CSCA Proefland"), sleutel: nepSleutel, door: nepSleutel, serie: 1 });
    const nepDsSleutel = sleutel();
    const nepDs = certificaat({ onderwerp: naam("UT", "DS Proefland"), uitgever: naam("UT", "CSCA Proefland"), sleutel: nepDsSleutel, door: nepSleutel, serie: 2 });
    const nepSod = maakSod({ groepen: { 1: DG1, 2: DG2 }, ondertekenaar: nepDsSleutel, dsCert: nepDs.der });
    // vertrouwd is alleen de echte CSCA
    const u = controleerChip({ dg1: DG1, dg2: DG2, sod: nepSod }, [CSCA.x509], NU);
    expect(u.handtekeningOk).toBe(true); // de vervalser ondertekende netjes met zijn eigen sleutel…
    expect(u.ketenOk).toBe(false); // …maar zijn ondertekenaar komt niet van de echte overheid
    expect(u.echt).toBe(false);
    void nepCsca;
  });

  it("een SOD ondertekend met een andere sleutel dan het meegestuurde certificaat", () => {
    const sod = maakSod({ groepen: { 1: DG1, 2: DG2 }, ondertekenaar: sleutel(), dsCert: DS.der });
    const u = controleerChip({ dg1: DG1, dg2: DG2, sod }, [CSCA.x509], NU);
    expect(u.handtekeningOk).toBe(false);
    expect(u.echt).toBe(false);
  });

  it("zonder CSCA van dit land: keten niet gecontroleerd, dus nooit 'echt'", () => {
    const u = controleerChip({ dg1: DG1, dg2: DG2, sod: SOD }, [], NU);
    expect(u.handtekeningOk).toBe(true);
    expect(u.ketenOk).toBeNull();
    expect(u.echt).toBe(false);
  });

  it("verlopen certificaten: niet echt", () => {
    const u = controleerChip({ dg1: DG1, dg2: DG2, sod: SOD }, [CSCA.x509], new Date("2037-01-01T12:00:00+01:00"));
    expect(u.ketenOk).toBe(true);
    expect(u.geldigOk).toBe(false);
    expect(u.echt).toBe(false);
  });

  it("werkt ook met RSA (sha256WithRSAEncryption)", () => {
    const r = sleutel("rsa");
    const csca = certificaat({ onderwerp: naam("UT", "CSCA Proefland"), uitgever: naam("UT", "CSCA Proefland"), sleutel: r, door: r, serie: 1 });
    const d = sleutel("rsa");
    const ds = certificaat({ onderwerp: naam("UT", "DS Proefland"), uitgever: naam("UT", "CSCA Proefland"), sleutel: d, door: r, serie: 2 });
    const sod = maakSod({ groepen: { 1: DG1 }, ondertekenaar: d, dsCert: ds.der });
    expect(controleerChip({ dg1: DG1, sod }, [csca.x509], NU).echt).toBe(true);
  });

  it("onzin als zegel: niet gelezen, niet echt, geen crash", () => {
    const u = controleerChip({ dg1: DG1, sod: Buffer.from("geen zegel") }, [CSCA.x509], NU);
    expect(u.gelezen).toBe(false);
    expect(u.echt).toBe(false);
    expect(u.fouten.length).toBeGreaterThan(0);
  });
});

describe("chip: hulpjes", () => {
  it("haalt een paspoort-MRZ (TD3, 88 tekens) uit DG1", () => {
    const td3 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" + "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
    expect(mrzUitDg1(tlv(0x61, tlv(0x5f1f, Buffer.from(td3, "latin1"))))?.formaat).toBe("TD3");
    expect(mrzUitDg1(Buffer.from([0x61, 0x00]))).toBeNull();
  });

  it("leest meerdere CSCA's uit één PEM-bestand", () => {
    const pem = (der: Buffer) => `-----BEGIN CERTIFICATE-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
    expect(certificatenUit(Buffer.from(pem(CSCA.der) + pem(DS.der)))).toHaveLength(2);
    expect(certificatenUit(CSCA.der)).toHaveLength(1);
  });
});
