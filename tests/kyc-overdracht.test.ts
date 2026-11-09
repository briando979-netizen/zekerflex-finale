import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// KV, Redis-claims en de uploadopslag in het geheugen
const kv = new Map<string, unknown>();
const claims = new Set<string>();
const uploads = new Map<string, { bytes: Buffer; filename: string; mimeType: string }>();
let volgnummer = 0;
let opslagFaaltBij = 0; // de zoveelste upload mislukt (0 = nooit)
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListEntries: async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([key, value]) => ({ key, value })),
}));
vi.mock("@/lib/redis", () => ({
  claimIdempotency: async (k: string) => (claims.has(k) ? false : (claims.add(k), true)),
  releaseIdempotency: async (k: string) => void claims.delete(k),
}));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (i: { bytes: Buffer; filename: string; mimeType: string }) => {
    const id = `up_${++volgnummer}`;
    if (volgnummer === opslagFaaltBij) throw new Error("schijf vol");
    uploads.set(id, { bytes: i.bytes, filename: i.filename, mimeType: i.mimeType });
    return { id };
  },
  readUpload: async (id: string) => uploads.get(id)!,
  deleteUpload: async (id: string) => void uploads.delete(id),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "proef-geheim-voor-de-overdracht-test-0123456789" } }));

import {
  annuleerOverdracht,
  leverOverdrachtIn,
  maakOverdracht,
  maskeerEmail,
  netwerkVan,
  nummerEinde,
  openOverdracht,
  overdrachtFoto,
  overdrachtGegevens,
  overdrachtGeldig,
  overdrachtMerk,
  overdrachtStatus,
  overdrachtUploads,
  overdrachtVoorbeeld,
  pakOverdracht,
  ruimOverdrachtOp,
  weigerOverdracht,
} from "@/lib/kyc/overdracht";

// vaste klok: geen tijdbom (AGENTS.md)
const NU = new Date("2026-11-09T12:00:00+01:00");
const later = (min: number) => new Date(NU.getTime() + min * 60_000);
const foto = (naam: string) => ({ filename: `${naam}.webp`, mimeType: "image/webp", bytes: Buffer.from(`foto-${naam}`) });
const INLEVERING = {
  soort: "ID_CARD" as const,
  gegevens: { nummer: "IXA12B3C4", datum: "2034-03-12", naam: "Briando van Essen" },
  voor: foto("voor"),
  achter: foto("achter"),
  selfie: foto("selfie"),
};

/** De telefoon opent de link en krijgt zijn toesteltoken. */
async function open(code: string, toestel?: string): Promise<string> {
  const o = await openOverdracht(code, toestel ?? null, NU);
  if (!o || !("toestel" in o)) throw new Error(`niet geopend: ${JSON.stringify(o)}`);
  return o.toestel;
}

beforeEach(() => {
  kv.clear();
  claims.clear();
  uploads.clear();
  volgnummer = 0;
  opslagFaaltBij = 0;
});

const tijdelijk = () => [...kv.keys()].filter((k) => k.startsWith("id-overdracht:"));

describe("verder op je telefoon (QR)", () => {
  it("een code: de laptop ziet wacht → geopend → klaar", async () => {
    const code = await maakOverdracht("usr_1", NU);
    expect(code).toMatch(/^usr_1\.[A-Za-z0-9_-]{32}$/);
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "wacht" });
    const toestel = await open(code);
    expect(toestel).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "geopend" });
    expect(await leverOverdrachtIn(code, toestel, INLEVERING, NU)).toBe(true);
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "klaar", soort: "ID_CARD" });
  });

  it("een verzonnen of andermans code werkt nooit, en na 20 minuten is de code verlopen", async () => {
    const code = await maakOverdracht("usr_1", NU);
    expect(await openOverdracht("usr_1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", null, NU)).toBeNull();
    expect(await openOverdracht("onzin", null, NU)).toBeNull();
    const ander = await maakOverdracht("usr_2", NU);
    expect(await openOverdracht(`usr_1.${ander.split(".")[1]}`, null, NU)).toBeNull();
    const toestel = await open(code);
    expect(await overdrachtGeldig(code, toestel, later(21))).toBeNull();
    expect(await overdrachtStatus("usr_1", later(21))).toEqual({ status: "verlopen" });
  });

  it("review H2: alleen het eerste toestel kan verder; een tweede toestel krijgt niets en de laptop ziet het", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const eerste = await open(code);
    expect(await openOverdracht(code, null, NU)).toEqual({ anderToestel: true });
    expect(await openOverdracht(code, "B".repeat(32), NU)).toEqual({ anderToestel: true });
    expect(await overdrachtGeldig(code, null, NU)).toBeNull();
    expect(await overdrachtGeldig(code, "B".repeat(32), NU)).toBeNull();
    expect(await leverOverdrachtIn(code, "B".repeat(32), INLEVERING, NU)).toBe(false);
    expect(uploads.size).toBe(0);
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "geopend", anderToestel: true });
    // het eerste toestel kan na herladen gewoon verder
    expect(await openOverdracht(code, eerste, NU)).toEqual({ userId: "usr_1", toestel: eerste });
    expect(await leverOverdrachtIn(code, eerste, INLEVERING, NU)).toBe(true);
  });

  it("review M1: inleveren kan maar één keer, ook tegelijk (eerst atomair claimen)", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    const [a, b] = await Promise.all([leverOverdrachtIn(code, toestel, INLEVERING, NU), leverOverdrachtIn(code, toestel, INLEVERING, NU)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(uploads.size).toBe(3); // één set, geen weesbestanden
    expect(await leverOverdrachtIn(code, toestel, INLEVERING, NU)).toBe(false);
    expect(await overdrachtGeldig(code, toestel, NU)).toBeNull();
  });

  it("review H1: 'dit is niet mijn account' laat de code vervallen; de laptop ziet geweigerd", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    expect(await weigerOverdracht(code, "B".repeat(32), NU)).toBeNull(); // niet vanaf een ander toestel
    expect(await weigerOverdracht(code, toestel, NU)).toEqual({ userId: "usr_1" });
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "geweigerd" });
    expect(await openOverdracht(code, toestel, NU)).toBeNull();
    expect(await leverOverdrachtIn(code, toestel, INLEVERING, NU)).toBe(false);
  });

  it("review H2: de laptop ziet eerst een voorbeeld en de foto's, en kan alles weggooien", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    await leverOverdrachtIn(code, toestel, INLEVERING, NU);
    expect(await overdrachtVoorbeeld("usr_1")).toEqual({ soort: "ID_CARD", naam: "Briando van Essen", nummer: "…3C4", datum: "2034-03-12" });
    expect(await overdrachtFoto("usr_2", "selfie")).toBeNull();
    await annuleerOverdracht("usr_1");
    expect(uploads.size).toBe(0);
    expect(tijdelijk()).toEqual([]);
  });

  it("de laptop bekijkt eerst de gegevens, haalt dan de foto's op; daarna is alles weg", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    await leverOverdrachtIn(code, toestel, INLEVERING, NU);
    expect(await overdrachtGegevens("usr_1")).toEqual({ soort: "ID_CARD", gegevens: INLEVERING.gegevens });
    expect(uploads.size).toBe(3); // bekijken maakt niets op
    const p = await pakOverdracht("usr_1");
    expect(p?.voor.bytes.toString()).toBe("foto-voor");
    expect(p?.selfie.bytes.toString()).toBe("foto-selfie");
    expect(uploads.size).toBe(0);
    expect(tijdelijk()).toEqual([]);
    expect(await pakOverdracht("usr_1")).toBeNull();
  });

  it("een nieuwe code vervangt de oude, met zijn foto's", async () => {
    const oud = await maakOverdracht("usr_1", NU);
    const toestel = await open(oud);
    await leverOverdrachtIn(oud, toestel, INLEVERING, NU);
    const nieuw = await maakOverdracht("usr_1", NU);
    expect(uploads.size).toBe(0);
    expect(await openOverdracht(oud, toestel, NU)).toBeNull();
    expect(await open(nieuw)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("de opruimtaak wist wat te lang blijft liggen, met de foto's", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    await leverOverdrachtIn(code, toestel, INLEVERING, NU);
    await maakOverdracht("usr_2", later(25));
    expect(await ruimOverdrachtOp(later(31))).toBe(1); // alleen die van usr_1 (31 min oud)
    expect(uploads.size).toBe(0);
    expect(tijdelijk()).toEqual(["id-overdracht:usr_2"]);
  });

  it("niets leesbaar in de opslag: geen documentnummer, naam, geheim of toesteltoken", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    await leverOverdrachtIn(code, toestel, INLEVERING, NU);
    const opslag = JSON.stringify([...kv.values()]);
    for (const geheim of ["IXA12B3C4", "Briando", "2034-03-12", code.split(".")[1]!, toestel]) expect(opslag).not.toContain(geheim);
  });

  it("review 2, H1: na inleveren onthoudt de server dat er iets via de telefoon kwam (30 dagen), los van de laptop", async () => {
    expect(await overdrachtMerk("usr_1", NU)).toEqual({ viaTelefoon: false, geweigerd: 0 });
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    expect(await overdrachtMerk("usr_1", NU)).toEqual({ viaTelefoon: false, geweigerd: 0 }); // openen alleen telt niet
    await leverOverdrachtIn(code, toestel, INLEVERING, NU);
    await pakOverdracht("usr_1"); // ook na afronden en wissen van de foto's blijft het merkteken
    expect(await overdrachtMerk("usr_1", later(60 * 24 * 29))).toEqual({ viaTelefoon: true, geweigerd: 0 });
    expect(await overdrachtMerk("usr_1", later(60 * 24 * 31))).toEqual({ viaTelefoon: false, geweigerd: 0 });
    expect(await overdrachtMerk("usr_2", NU)).toEqual({ viaTelefoon: false, geweigerd: 0 });
  });

  it("review 2, H1/M2: 'niet mijn account' telt mee voor de beoordelaar", async () => {
    for (let i = 0; i < 2; i++) {
      const code = await maakOverdracht("usr_1", NU);
      await weigerOverdracht(code, await open(code), NU);
    }
    expect(await overdrachtMerk("usr_1", NU)).toEqual({ viaTelefoon: false, geweigerd: 2 });
  });

  it("review 2, H1: de laptop krijgt alleen een klein, wazig voorbeeld", async () => {
    const groot = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#7a8c99" } }).jpeg().toBuffer();
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    const echt = { filename: "voor.webp", mimeType: "image/webp", bytes: groot };
    await leverOverdrachtIn(code, toestel, { ...INLEVERING, voor: echt, achter: echt, selfie: echt }, NU);
    const v = await overdrachtFoto("usr_1", "voor");
    expect(v?.mimeType).toBe("image/jpeg");
    const meta = await sharp(v!.bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(160);
    // de verificatie zelf krijgt de foto ongewijzigd
    expect((await pakOverdracht("usr_1"))?.voor.bytes.equals(groot)).toBe(true);
  });

  it("review 2, L1: twee toestellen die tegelijk openen krijgen nooit allebei een token", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const [a, b] = await Promise.all([openOverdracht(code, null, NU), openOverdracht(code, null, NU)]);
    expect([a, b].filter((o) => o && "toestel" in o)).toHaveLength(1);
    expect([a, b].filter((o) => o && "anderToestel" in o)).toHaveLength(1);
  });

  it("review 3: een ander toestel dat de link bestookt, kan het merkteken niet wissen", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    await Promise.all([
      leverOverdrachtIn(code, toestel, INLEVERING, NU),
      ...Array.from({ length: 5 }, () => openOverdracht(code, "B".repeat(32), NU)),
    ]);
    expect(await overdrachtMerk("usr_1", NU)).toEqual({ viaTelefoon: true, geweigerd: 0 });
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "klaar", soort: "ID_CARD", anderToestel: true });
  });

  it("review 2, L1: een ander toestel overschrijft de overdracht nooit (klaar blijft klaar)", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    expect(await openOverdracht(code, "B".repeat(32), NU)).toEqual({ anderToestel: true });
    expect(await leverOverdrachtIn(code, toestel, INLEVERING, NU)).toBe(true);
    expect(await openOverdracht(code, "B".repeat(32), NU)).toBeNull();
    expect(await overdrachtStatus("usr_1", NU)).toEqual({ status: "klaar", soort: "ID_CARD", anderToestel: true });
    expect(uploads.size).toBe(3);
  });

  it("review 2: half gelukt opslaan laat geen foto's slingeren", async () => {
    const code = await maakOverdracht("usr_1", NU);
    const toestel = await open(code);
    opslagFaaltBij = 2;
    await expect(leverOverdrachtIn(code, toestel, INLEVERING, NU)).rejects.toThrow();
    expect(uploads.size).toBe(0);
    // de claim is vrijgegeven: meteen opnieuw proberen lukt
    expect(await leverOverdrachtIn(code, toestel, INLEVERING, NU)).toBe(true);
    expect(await overdrachtUploads("usr_1")).toHaveLength(3);
    expect(await overdrachtUploads("usr_2")).toEqual([]);
  });

  it("de opruimtaak wist ook merktekens van meer dan 30 dagen oud", async () => {
    const code = await maakOverdracht("usr_1", NU);
    await leverOverdrachtIn(code, await open(code), INLEVERING, NU);
    await pakOverdracht("usr_1");
    expect(await ruimOverdrachtOp(later(60 * 24 * 10))).toBe(0);
    expect(await ruimOverdrachtOp(later(60 * 24 * 31))).toBe(1);
    expect(kv.size).toBe(0);
  });

  it("het netwerk van een adres: IPv4 tot /24, IPv6 tot /48", () => {
    expect(netwerkVan("83.84.85.86")).toBe("83.84.85");
    expect(netwerkVan("::ffff:10.0.0.7")).toBe("10.0.0");
    expect(netwerkVan("2a02:a45:1234:5678::1")).toBe("2a02:a45:1234");
    expect(netwerkVan("2001:DB8::1")).toBe("2001:db8:0");
    expect(netwerkVan("2001:0db8:0001:0000:0000:0000:0000:0001")).toBe("2001:db8:1");
    expect(netwerkVan("local")).toBeNull();
    expect(netwerkVan("")).toBeNull();
    expect(netwerkVan(null)).toBeNull();
  });

  it("gemaskeerd e-mailadres en het einde van het documentnummer", () => {
    expect(maskeerEmail("briando@gmail.com")).toBe("b•••@gmail.com");
    expect(maskeerEmail("x")).toBe("•••");
    expect(nummerEinde("IXA 12B3C4")).toBe("…3C4");
    expect(nummerEinde("AB")).toBe("…");
  });
});
