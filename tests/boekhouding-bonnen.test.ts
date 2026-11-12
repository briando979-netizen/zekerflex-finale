import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

type Rij = Record<string, any>;
const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  bonnen: new Map<string, Rij>(),
  n: 0,
  admin: { id: "adminAAAAAA1", valuta: "EUR", actief: true } as Rij,
  boekFout: null as Error | null,
  boekCalls: [] as Rij[],
  bestanden: [] as string[],
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/ocr/engine", () => ({ leesTekst: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({ chat: vi.fn(), extractJson: vi.fn() }));
vi.mock("@/lib/boekhouding/bonnen/opslag", () => ({
  schrijfBonBestand: async (pad: string) => {
    m.bestanden.push(pad);
    return { nieuw: true };
  },
}));
vi.mock("@/lib/boekhouding/boek", () => ({
  boekInTransactie: async (_tx: unknown, invoer: Rij) => {
    if (m.boekFout) throw m.boekFout;
    m.boekCalls.push(invoer);
    return { boekingId: `bk${m.boekCalls.length}`, boekstuk: `IK-2026-00000${m.boekCalls.length}`, nieuw: true };
  },
}));
vi.mock("@/lib/prisma", () => {
  const rekeningen = ["4000", "4100", "1300", "2200", "1100"].map((nummer) => ({ id: `rek-${nummer}`, nummer }));
  const codes = ["NL21-I", "NL09-I", "NL00-I"].map((code) => ({ id: `btw-${code}`, code }));
  const db = {
    boekAdministratie: { findUnique: async () => m.admin },
    boekBon: {
      findUnique: async ({ where }: Rij) => {
        const alle = [...m.bonnen.values()];
        if (where.administratieId_bestandSha256) {
          const k = where.administratieId_bestandSha256;
          return alle.find((b) => b.administratieId === k.administratieId && b.bestandSha256 === k.bestandSha256) ?? null;
        }
        const b = m.bonnen.get(where.id);
        return b ? { ...b, administratie: { valuta: m.admin.valuta, actief: m.admin.actief } } : null;
      },
      create: async ({ data }: Rij) => {
        const rij = { id: `bon${(m.n += 1)}`, status: "NIEUW", evenKijkenReden: null, ...data };
        m.bonnen.set(rij.id, rij);
        return { id: rij.id, administratieId: rij.administratieId, bestandSha256: rij.bestandSha256 };
      },
      update: async ({ where, data }: Rij) => {
        const b = m.bonnen.get(where.id)!;
        Object.assign(b, data);
        return b;
      },
      findMany: async ({ where }: Rij) =>
        [...m.bonnen.values()].filter(
          (b) =>
            b.administratieId === where.administratieId &&
            b.id !== where.id.not &&
            b.status !== where.status.not &&
            b.bonDatum?.getTime() === where.bonDatum.getTime() &&
            b.totaalCents === where.totaalCents,
        ),
    },
    boekRekening: {
      findFirst: async ({ where }: Rij) => rekeningen.find((r) => r.nummer === where.nummer) ?? null,
      findMany: async ({ where }: Rij) => rekeningen.filter((r) => where.nummer.in.includes(r.nummer)),
    },
    boekBtwCode: {
      findFirst: async ({ where }: Rij) => codes.find((c) => c.code === where.code) ?? null,
      findMany: async ({ where }: Rij) => codes.filter((c) => where.code.in.includes(c.code)),
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const snap = new Map([...m.bonnen].map(([k, v]) => [k, { ...v }] as const));
      try {
        return await cb(db);
      } catch (e) {
        m.bonnen.clear();
        for (const [k, v] of snap) m.bonnen.set(k, v);
        throw e;
      }
    },
  };
  return { prisma: db };
});

import { keurBonGoed, ontvangBon, wijsBonAf } from "@/lib/boekhouding/bonnen/bonnen";
import { leesBonKop } from "@/lib/boekhouding/bonnen/bonkop";
import { leesEigenAfzenders, schrijfEigenAfzenders } from "@/lib/boekhouding/bonnen/afzenders";
import { MAX_BIJLAGEN_PER_MAIL, verwerkBonnetjesMail } from "@/lib/boekhouding/bonnen/mail";
import type { Uitlezer } from "@/lib/boekhouding/bonnen/uitlezen";

const NU = new Date("2026-11-12T10:00:00Z");
const ADM = "adminAAAAAA1";
const pdf = (n: number) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2000, n)]);

const GOED = { leverancier: "Hetzner Online GmbH", datum: "2026-10-30", totaalCents: 12100, btwCents: 2100, btwPercentage: 21, valuta: "EUR", categorie: "4000" };
const uitlezer = (o: Partial<typeof GOED> = {}, promille = 950): Uitlezer => async () => ({
  tekst: `Rechnung totaal ${(({ ...GOED, ...o }).totaalCents / 100).toFixed(2).replace(".", ",")} EUR`,
  ocrVertrouwen: null,
  ruw: { ...GOED, ...o },
  modelPromille: promille,
  modelNaam: "testmodel",
  problemen: [],
});
const beheerder = { bron: "upload", beheerder: true } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  m.kv.clear();
  m.bonnen.clear();
  m.n = 0;
  m.admin = { id: ADM, valuta: "EUR", actief: true };
  m.boekFout = null;
  m.boekCalls.length = 0;
  m.bestanden.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("ontvangBon", () => {
  it("upload door een beheerder met een kloppende bon wordt geboekt via boek (bron BON, bronId = bon-id)", async () => {
    const r = await ontvangBon({ administratieId: ADM, bytes: pdf(1), geuploadDoor: "user1", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    expect(r).toMatchObject({ status: "GEBOEKT", nieuw: true, boekstuk: "IK-2026-000001" });
    expect(m.boekCalls).toHaveLength(1);
    expect(m.boekCalls[0]).toMatchObject({ bron: "BON", bronId: r.bonId, dagboek: "INKOOP", datum: "2026-10-30", aangemaaktDoor: "systeem" });
    expect(m.boekCalls[0]!.omschrijving).toMatch(/^Bon B-2026-[0-9A-F]{8}$/);
    expect(m.boekCalls[0]!.omschrijving).not.toMatch(/hetzner/i);
    const bon = m.bonnen.get(r.bonId)!;
    expect(bon).toMatchObject({ status: "GEBOEKT", boekingId: "bk1", leverancier: "Hetzner Online GmbH", totaalCents: 12100, btwCents: 2100, zekerheidPromille: 950, geuploadDoor: "user1" });
    expect(bon.bewaarTot.toISOString().slice(0, 10)).toBe("2033-12-31");
    expect(m.bestanden[0]).toMatch(/^boekhouding\/bonnen\/adminAAAAAA1\/[0-9a-f]{2}\/[0-9a-f]{64}\.pdf$/);
  });

  it("hetzelfde bestand twee keer geeft dezelfde bon en boekt niet opnieuw", async () => {
    const eerste = await ontvangBon({ administratieId: ADM, bytes: pdf(1), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    const tweede = await ontvangBon({ administratieId: ADM, bytes: pdf(1), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    expect(tweede).toMatchObject({ bonId: eerste.bonId, nieuw: false, status: "GEBOEKT" });
    expect(m.boekCalls).toHaveLength(1);
    expect(m.bonnen.size).toBe(1);
  });

  it("zelfde leverancier, datum en bedrag in een ander bestand wordt als dubbel afgewezen en niet geboekt", async () => {
    const eerste = await ontvangBon({ administratieId: ADM, bytes: pdf(1), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    const tweede = await ontvangBon({ administratieId: ADM, bytes: pdf(2), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    expect(tweede).toMatchObject({ status: "AFGEWEZEN", nieuw: true, dubbelVan: eerste.bonId });
    expect(m.bonnen.get(tweede.bonId)!.afwijsReden).toContain(eerste.bonId);
    expect(m.boekCalls).toHaveLength(1);
  });

  it("mail van een onbekende afzender is even kijken en slaat de afzender op bij de bon, niet in de boeking", async () => {
    const r = await ontvangBon({
      administratieId: ADM,
      bytes: pdf(3),
      geuploadDoor: "mail",
      herkomst: { bron: "mail", afzenderOpLijst: false, spfDkimGeslaagd: true },
      kop: { afzender: "iemand@example.test", datum: "Thu, 12 Nov 2026 09:00:00 +0100", onderwerp: "Factuur" },
      now: NU,
      uitlezer: uitlezer(),
    });
    expect(r.status).toBe("EVEN_KIJKEN");
    expect(r.redenen.join(" ")).toMatch(/lijst met eigen afzenders/);
    expect(m.boekCalls).toHaveLength(0);
    expect(await leesBonKop(r.bonId)).toMatchObject({ afzender: "iemand@example.test", onderwerp: "Factuur" });
    expect(m.bonnen.get(r.bonId)!.evenKijkenReden).toMatch(/eigen afzenders/);
  });

  it("een afwijking (bedrag klopt niet) is even kijken, ook voor een beheerder", async () => {
    const r = await ontvangBon({ administratieId: ADM, bytes: pdf(4), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer({ btwCents: 5000 }) });
    expect(r.status).toBe("EVEN_KIJKEN");
    expect(m.boekCalls).toHaveLength(0);
    expect(m.bonnen.get(r.bonId)!.zekerheidPromille).toBeLessThanOrEqual(400);
  });

  it("een lage zekerheid van het model is even kijken", async () => {
    const r = await ontvangBon({ administratieId: ADM, bytes: pdf(5), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer({}, 600) });
    expect(r.status).toBe("EVEN_KIJKEN");
  });

  it("een uitlezer die gooit of niets leest geeft even kijken met een reden, geen gooi", async () => {
    const stuk: Uitlezer = async () => {
      throw new Error("kapot");
    };
    const a = await ontvangBon({ administratieId: ADM, bytes: pdf(6), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: stuk });
    expect(a).toMatchObject({ status: "EVEN_KIJKEN" });
    const leeg: Uitlezer = async () => ({ tekst: null, ocrVertrouwen: null, ruw: {}, modelPromille: null, modelNaam: null, problemen: ["Deze pdf heeft geen leesbare tekstlaag."] });
    const b = await ontvangBon({ administratieId: ADM, bytes: pdf(7), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: leeg });
    expect(b.status).toBe("EVEN_KIJKEN");
    expect(b.redenen.join(" ")).toMatch(/tekstlaag/);
  });

  it("een vergrendelde periode (boek gooit) wordt even kijken en de bon blijft niet half geboekt", async () => {
    m.boekFout = AppError.validation("De periode 2026-10 is vergrendeld.");
    const r = await ontvangBon({ administratieId: ADM, bytes: pdf(8), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    expect(r.status).toBe("EVEN_KIJKEN");
    expect(r.redenen[0]).toMatch(/vergrendeld/);
    expect(m.bonnen.get(r.bonId)!.status).toBe("EVEN_KIJKEN");
    expect(m.bonnen.get(r.bonId)!.boekingId).toBeUndefined();
  });

  it("een vreemde valuta wordt niet geboekt", async () => {
    const r = await ontvangBon({ administratieId: ADM, bytes: pdf(9), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer({ valuta: "USD" }) });
    expect(r.status).toBe("EVEN_KIJKEN");
    expect(r.redenen.join(" ")).toMatch(/USD/);
  });

  it("weigert een ongeldig bestand, een onbekende en een niet-actieve administratie", async () => {
    await expect(ontvangBon({ administratieId: ADM, bytes: Buffer.from("MZ exe"), geuploadDoor: "u", herkomst: beheerder })).rejects.toThrow(/geen pdf/);
    m.admin = { ...m.admin, actief: false };
    await expect(ontvangBon({ administratieId: ADM, bytes: pdf(1), geuploadDoor: "u", herkomst: beheerder })).rejects.toThrow(/niet actief/);
  });
});

describe("keurBonGoed en wijsBonAf", () => {
  const evenKijken = async (extra: Partial<typeof GOED> = {}) =>
    (await ontvangBon({ administratieId: ADM, bytes: pdf(20), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer({ btwCents: 5000, ...extra }) })).bonId;

  it("een mens boekt een bon met verbeterde velden en de bon wordt GEBOEKT door die beheerder", async () => {
    const id = await evenKijken();
    const r = await keurBonGoed(id, { ...GOED, btwCents: 2100 }, { door: "user9", now: NU });
    expect(r.boekstuk).toBe("IK-2026-000001");
    expect(m.boekCalls[0]).toMatchObject({ bron: "BON", bronId: id, aangemaaktDoor: "user9" });
    expect(m.bonnen.get(id)).toMatchObject({ status: "GEBOEKT", boekingId: "bk1", evenKijkenReden: null });
    await expect(keurBonGoed(id, GOED, { door: "user9", now: NU })).rejects.toThrow(/al geboekt/);
  });

  it("weigert foute velden met Nederlandse tekst en boekt niets", async () => {
    const id = await evenKijken();
    await expect(keurBonGoed(id, { ...GOED, datum: "2027-01-01" }, { door: "u", now: NU })).rejects.toThrow(/toekomst/);
    expect(m.boekCalls).toHaveLength(0);
    await expect(keurBonGoed("bestaatniet", GOED, { door: "u" })).rejects.toThrow(/bestaat niet/);
  });

  it("een dubbele bij het goedkeuren moet bevestigd worden", async () => {
    await ontvangBon({ administratieId: ADM, bytes: pdf(21), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer() });
    const id = await evenKijken({ leverancier: "Andere leverancier" });
    await expect(keurBonGoed(id, GOED, { door: "u", now: NU })).rejects.toThrow(/al een bon met dezelfde/);
    await expect(keurBonGoed(id, GOED, { door: "u", now: NU, ondanksDubbel: true })).resolves.toMatchObject({ boekstuk: expect.any(String) });
  });

  it("wijsBonAf: reden verplicht, een geboekte bon niet", async () => {
    const id = await evenKijken();
    await expect(wijsBonAf(id, " ", "u")).rejects.toThrow(/reden/);
    await wijsBonAf(id, "Geen bon van ons", "u");
    expect(m.bonnen.get(id)).toMatchObject({ status: "AFGEWEZEN", afwijsReden: "Geen bon van ons" });
    await expect(keurBonGoed(id, GOED, { door: "u", now: NU })).rejects.toThrow(/afgewezen/);
    const geboekt = (await ontvangBon({ administratieId: ADM, bytes: pdf(22), geuploadDoor: "u", herkomst: beheerder, now: NU, uitlezer: uitlezer({ totaalCents: 24200, btwCents: 4200 }) })).bonId;
    await expect(wijsBonAf(geboekt, "toch niet", "u")).rejects.toThrow(/al geboekt/);
  });
});

describe("lijst eigen afzenders (KV)", () => {
  it("standaard leeg, schrijven valideert en een kapotte waarde geeft een lege lijst", async () => {
    expect(await leesEigenAfzenders()).toEqual([]);
    expect(await schrijfEigenAfzenders(["@Hetzner.com"])).toEqual(["@hetzner.com"]);
    expect(m.kv.get("boekhouding:eigen-afzenders")).toEqual(["@hetzner.com"]);
    await expect(schrijfEigenAfzenders(["rommel"])).rejects.toThrow();
    expect(m.kv.get("boekhouding:eigen-afzenders")).toEqual(["@hetzner.com"]);
    m.kv.set("boekhouding:eigen-afzenders", { kapot: true });
    expect(await leesEigenAfzenders()).toEqual([]);
  });
});

describe("verwerkBonnetjesMail", () => {
  const kop = (extra = "", id = "m1@hetzner.com") =>
    [
      "From: Hetzner <factuur@hetzner.com>",
      "To: info@zekerflex.com",
      "X-Original-To: bonnetjes@zekerflex.com",
      "Subject: Rechnung",
      "Date: Thu, 12 Nov 2026 09:00:00 +0100",
      `Message-ID: <${id}>`,
      "Authentication-Results: mx.transip.nl; spf=pass smtp.mailfrom=hetzner.com; dkim=pass header.d=hetzner.com",
      extra,
    ].join("\r\n");
  const bijlage = (n: number) => ({ filename: "factuur.pdf", contentType: "application/pdf", bytes: pdf(n) });
  const basis = { administratieId: ADM, heeftHtml: false, now: NU, uitlezer: uitlezer() };

  it("gewone mail in info@ wordt niet aangeraakt", async () => {
    const r = await verwerkBonnetjesMail({ ...basis, kop: "From: a@b.nl\r\nTo: info@zekerflex.com\r\nMessage-ID: <x@y>", bijlagen: [bijlage(30)], eigenAfzenders: ["@b.nl"] });
    expect(r).toEqual({ soort: "geen-bonnetje" });
    expect(m.bonnen.size).toBe(0);
    expect([...m.kv.keys()]).toEqual([]);
  });

  it("eigen afzender met spf en dkim: vanzelf geboekt, en dezelfde mail nooit twee keer", async () => {
    const invoer = { ...basis, kop: kop(), bijlagen: [bijlage(31)], eigenAfzenders: ["@hetzner.com"] };
    const r = await verwerkBonnetjesMail(invoer);
    expect(r).toMatchObject({ soort: "verwerkt", overgeslagen: 0 });
    expect(r.soort === "verwerkt" && r.bonnen[0]).toMatchObject({ status: "GEBOEKT", boekstuk: "IK-2026-000001" });
    expect(await verwerkBonnetjesMail(invoer)).toEqual({ soort: "al-verwerkt" });
    expect(m.boekCalls).toHaveLength(1);
    expect(m.bonnen.size).toBe(1);
  });

  it("afzender niet op de lijst, of zonder geslaagde dkim: even kijken met afzender zichtbaar", async () => {
    const a = await verwerkBonnetjesMail({ ...basis, kop: kop("", "m2@x"), bijlagen: [bijlage(32)], eigenAfzenders: [] });
    expect(a.soort === "verwerkt" && a.bonnen[0]?.status).toBe("EVEN_KIJKEN");
    expect(a.soort === "verwerkt" && (await leesBonKop(a.bonnen[0]!.bonId))?.afzender).toBe("factuur@hetzner.com");
    const zonderDkim = kop("", "m3@x").replace("dkim=pass", "dkim=fail");
    const b = await verwerkBonnetjesMail({ ...basis, kop: zonderDkim, bijlagen: [bijlage(33)], eigenAfzenders: ["@hetzner.com"], uitlezer: uitlezer({ totaalCents: 24200, btwCents: 4200 }) });
    expect(b.soort === "verwerkt" && b.bonnen[0]?.status).toBe("EVEN_KIJKEN");
    expect(m.boekCalls).toHaveLength(0);
  });

  it("html-mail zonder bijlage is even kijken: alleen de kopvelden, geen bon, en ook niet twee keer", async () => {
    const invoer = { ...basis, kop: kop("", "m4@x"), bijlagen: [], heeftHtml: true, eigenAfzenders: ["@hetzner.com"] };
    expect(await verwerkBonnetjesMail(invoer)).toEqual({ soort: "zonder-bijlage" });
    expect(await verwerkBonnetjesMail(invoer)).toEqual({ soort: "al-verwerkt" });
    expect(m.bonnen.size).toBe(0);
    const rij = [...m.kv].find(([k]) => k.startsWith("boekhouding:bonmail:zonder-bijlage:"))?.[1] as Rij;
    expect(rij).toMatchObject({ afzender: "factuur@hetzner.com", onderwerp: "Rechnung" });
    expect(rij.reden).toMatch(/html/i);
  });

  it("slaat een bijlage die geen bon kan zijn over en begrenst het aantal", async () => {
    const klein = { filename: "logo.png", contentType: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
    const exe = { filename: "x.pdf", contentType: "application/pdf", bytes: Buffer.alloc(3000, 77) };
    const r = await verwerkBonnetjesMail({ ...basis, kop: kop("", "m5@x"), bijlagen: [klein, exe], eigenAfzenders: [] });
    expect(r).toEqual({ soort: "zonder-bijlage" });
    const veel = Array.from({ length: MAX_BIJLAGEN_PER_MAIL + 2 }, (_, i) => bijlage(40 + i));
    const r2 = await verwerkBonnetjesMail({ ...basis, kop: kop("", "m6@x"), bijlagen: veel, eigenAfzenders: [], uitlezer: uitlezer({}, 100) });
    expect(r2.soort === "verwerkt" && r2.bonnen).toHaveLength(MAX_BIJLAGEN_PER_MAIL);
    expect(r2.soort === "verwerkt" && r2.overgeslagen).toBe(2);
  });

  it("geen Authentication-Results = nooit vertrouwd", async () => {
    const zonder = kop("", "m7@x").split("\r\n").filter((r) => !r.startsWith("Authentication-Results")).join("\r\n");
    const r = await verwerkBonnetjesMail({ ...basis, kop: zonder, bijlagen: [bijlage(60)], eigenAfzenders: ["@hetzner.com"] });
    expect(r.soort === "verwerkt" && r.bonnen[0]?.status).toBe("EVEN_KIJKEN");
  });
});
