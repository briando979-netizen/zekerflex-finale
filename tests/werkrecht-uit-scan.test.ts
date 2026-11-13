import { beforeEach, describe, expect, it, vi } from "vitest";

// Het recht om te werken uit de ID-scan (kaartpunt 16). De scan bewaart alleen de CATEGORIE (rawPayload.werkrecht = "vrij", lib/onboarding/verify.ts);
// lib/werkrecht/store.ts (idStand) leest die in de database met een vast filter en geeft alleen booleans terug. Deze test legt dat vast:
// een geverifieerde ID met categorie vrij is "ok via id" zonder verklaring; wacht, afgekeurd, rijbewijs, verlopen of geen scan houdt de vraag;
// en er komt nooit een nationaliteit, BSN, MRZ-tekst of documentnummer in de uitvoer of in het filter.

const h = vi.hoisted(() => ({ rijen: [] as { status: string }[], where: null as unknown, vlag: true }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    identityVerification: {
      findMany: async (a: { where: unknown }) => {
        h.where = a.where;
        return h.rijen;
      },
    },
    workRight: { findMany: async () => [], findUnique: async () => null },
  },
}));
vi.mock("@/lib/storage/local", () => ({ deleteUpload: vi.fn(), readUpload: vi.fn(), storeUpload: vi.fn() }));
vi.mock("@/lib/storage/validate", () => ({ sniffAndVerifyUploadType: vi.fn() }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: () => undefined }));
vi.mock("@/lib/flags", () => ({ featureEnabled: async () => h.vlag }));

import { idStand, idVrij, werkrechtOverzicht, werkrechtVoorWerk } from "@/lib/werkrecht/store";

const NU = new Date("2026-11-14T10:00:00+01:00");
const VERBODEN = /nationalit|bsn|mrz|documentnummer|documentnumber|geboorte/i;

function sleutels(o: unknown): string[] {
  if (Array.isArray(o)) return o.flatMap(sleutels);
  if (o && typeof o === "object") return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => [k, ...sleutels(v)]);
  return [];
}

beforeEach(() => {
  h.rijen = [];
  h.where = null;
  h.vlag = true;
});

describe("het filter waarmee de categorie uit de scan wordt gelezen", () => {
  it("alleen een goedgekeurde of wachtende eigen controle, geen rijbewijs, niet verlopen, en alleen de categorie 'vrij'", async () => {
    await idStand("w1", NU);
    expect(h.where).toMatchObject({
      userId: "w1",
      provider: "AI_LOCAL",
      status: { in: ["VERIFIED", "PENDING"] },
      documentType: { not: "DRIVERS_LICENSE" },
      rawPayload: { path: ["werkrecht"], equals: "vrij" },
    });
    // een afgekeurde controle (REJECTED) doet dus nooit mee, ook niet met categorie vrij
    expect(JSON.stringify(h.where)).not.toContain("REJECTED");
    expect((h.where as { OR: unknown[] }).OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: NU } }]);
  });

  it("het filter noemt geen nationaliteit, BSN, MRZ of documentnummer", async () => {
    await idStand("w1", NU);
    expect(JSON.stringify(h.where)).not.toMatch(VERBODEN);
  });
});

describe("wat het filter oplevert", () => {
  it("een geverifieerde ID met categorie vrij: vrij, en Nederland is ok via de ID zonder verklaring", async () => {
    h.rijen = [{ status: "VERIFIED" }];
    expect(await idVrij("w1", NU)).toBe(true);
    const [nl] = await werkrechtOverzicht("w1", NU);
    expect(nl).toMatchObject({ land: "NL", stand: "ok", via: "id", idBewijs: true, verklaard: false, document: null });
    expect(await werkrechtVoorWerk("w1", "NL", NU)).toEqual({ ok: true, reden: null });
  });

  it("een ID die nog bij een medewerker ligt (wacht): niet vrij, de stand is 'wacht', er wordt niets gevraagd of geuploadet maar het werk wacht", async () => {
    h.rijen = [{ status: "PENDING" }];
    expect(await idStand("w1", NU)).toEqual({ vrij: false, inBehandeling: true });
    const [nl] = await werkrechtOverzicht("w1", NU);
    expect(nl).toMatchObject({ stand: "wacht", via: null, idBewijs: true });
    expect((await werkrechtVoorWerk("w1", "NL", NU)).ok).toBe(false);
  });

  it("geen scan, of een scan zonder categorie vrij: de vraag blijft (verklaring aanvinken)", async () => {
    h.rijen = [];
    expect(await idStand("w1", NU)).toEqual({ vrij: false, inBehandeling: false });
    const [nl] = await werkrechtOverzicht("w1", NU);
    expect(nl).toMatchObject({ stand: "verklaring-nodig", via: null, idBewijs: false });
    const w = await werkrechtVoorWerk("w1", "NL", NU);
    expect(w.ok).toBe(false);
    expect(w.reden).toContain("verklaring");
  });

  it("de vlag werkrecht-eis blijft ongemoeid: staat hij uit, dan wordt niets gevraagd of geblokkeerd", async () => {
    h.vlag = false;
    h.rijen = [];
    expect(await werkrechtVoorWerk("w1", "NL", NU)).toEqual({ ok: true, reden: null });
  });
});

describe("de uitvoer bevat nooit gegevens uit het document", () => {
  it("geen enkele sleutel, ook niet genest, noemt nationaliteit, BSN, MRZ of documentnummer", async () => {
    for (const rijen of [[{ status: "VERIFIED" }], [{ status: "PENDING" }], []]) {
      h.rijen = rijen;
      const uit = await werkrechtOverzicht("w1", NU);
      expect(sleutels(uit).filter((k) => VERBODEN.test(k))).toEqual([]);
      expect(sleutels(await idStand("w1", NU)).filter((k) => VERBODEN.test(k))).toEqual([]);
    }
  });
});
