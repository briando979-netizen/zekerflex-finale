import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VERKLARING_VERSIE,
  WERK_LANDEN,
  geldigTotDag,
  landNaam,
  landUit,
  werkrechtReden,
  werkrechtUitslag,
  type WerkrechtRij,
} from "@/lib/werkrecht/landen";

// Recht om te werken per land (lib/werkrecht): verklaring + bewijs, en de controle vóór een dienst.

const NU = new Date("2026-11-09T12:00:00+01:00");
const MORGEN = new Date("2026-11-10T00:00:00+01:00");
const GISTEREN = new Date("2026-11-08T00:00:00+01:00");

function rij(over: Partial<WerkrechtRij> = {}): WerkrechtRij {
  return { declaredAt: new Date("2026-11-01T10:00:00+01:00"), declaration: VERKLARING_VERSIE, uploadId: null, status: null, validUntil: null, ...over };
}

describe("werkrechtUitslag", () => {
  it("zonder (of met een oude) verklaring: eerst aanvinken", () => {
    expect(werkrechtUitslag("NL", null, false, NU).stand).toBe("verklaring-nodig");
    expect(werkrechtUitslag("NL", rij({ declaration: "2020-01-01" }), false, NU).stand).toBe("verklaring-nodig");
  });

  it("met een EU/EER/CH-paspoort of -ID-kaart uit de ID-controle: geen verklaring nodig (binnen de EU/EER/CH)", () => {
    expect(werkrechtUitslag("NL", null, true, NU)).toEqual({ stand: "ok", via: "id" });
    expect(werkrechtUitslag("DE", null, true, NU)).toEqual({ stand: "ok", via: "id" });
    expect(werkrechtUitslag("NL", null, false, NU, true)).toEqual({ stand: "wacht", via: null });
    // buiten de EU blijven verklaring en document nodig
    expect(werkrechtUitslag("GB", null, true, NU).stand).toBe("verklaring-nodig");
  });

  it("EU/EER/CH-document uit de ID-controle is het bewijs binnen de EU/EER/CH, niet daarbuiten", () => {
    expect(werkrechtUitslag("NL", rij(), true, NU)).toEqual({ stand: "ok", via: "id" });
    expect(werkrechtUitslag("DE", rij(), true, NU)).toEqual({ stand: "ok", via: "id" });
    expect(werkrechtUitslag("CH", rij(), true, NU)).toEqual({ stand: "ok", via: "id" });
    expect(werkrechtUitslag("GB", rij(), true, NU).stand).toBe("bewijs-nodig");
    expect(werkrechtUitslag("US", rij(), true, NU).stand).toBe("bewijs-nodig");
  });

  it("zonder EU-document (rijbewijs, buiten de EU): pas na goedkeuring door een medewerker", () => {
    expect(werkrechtUitslag("NL", rij(), false, NU).stand).toBe("bewijs-nodig");
    expect(werkrechtUitslag("NL", rij({ uploadId: "u1", status: "UPLOADED", validUntil: MORGEN }), false, NU).stand).toBe("wacht");
    expect(werkrechtUitslag("NL", rij({ uploadId: "u1", status: "REJECTED", validUntil: MORGEN }), false, NU).stand).toBe("afgewezen");
    expect(werkrechtUitslag("NL", rij({ uploadId: "u1", status: "APPROVED", validUntil: MORGEN }), false, NU)).toEqual({ stand: "ok", via: "document" });
  });

  it("een verlopen document telt niet meer, behalve met een EU-document binnen de EU", () => {
    const verlopen = rij({ uploadId: "u1", status: "APPROVED", validUntil: GISTEREN });
    expect(werkrechtUitslag("NL", verlopen, false, NU).stand).toBe("verlopen");
    expect(werkrechtUitslag("GB", verlopen, true, NU).stand).toBe("verlopen");
    expect(werkrechtUitslag("NL", verlopen, true, NU)).toEqual({ stand: "ok", via: "id" });
  });

  it("een EU-document dat nog bij een medewerker ligt: \"wacht\" binnen de EU, niets uploaden; daarbuiten een document", () => {
    expect(werkrechtUitslag("NL", rij(), false, NU, true)).toEqual({ stand: "wacht", via: null });
    expect(werkrechtUitslag("DE", rij(), false, NU, true).stand).toBe("wacht");
    expect(werkrechtUitslag("GB", rij(), false, NU, true).stand).toBe("bewijs-nodig");
    expect(werkrechtUitslag("GB", null, false, NU, true).stand).toBe("verklaring-nodig");
  });

  it("een status zonder upload (document weg) telt niet als bewijs", () => {
    expect(werkrechtUitslag("GB", rij({ uploadId: null, status: "APPROVED", validUntil: MORGEN }), false, NU).stand).toBe("bewijs-nodig");
  });
});

describe("werkrechtReden", () => {
  it("geen melding als het in orde is; anders noemt hij het land en geen rijbewijs", () => {
    expect(werkrechtReden("ok", "Nederland")).toBeNull();
    expect(werkrechtReden("verklaring-nodig", "Nederland")).toContain("in Nederland mag werken");
    expect(werkrechtReden("bewijs-nodig", "Nederland")).toContain("geen rijbewijs");
    for (const st of ["wacht", "afgewezen", "verlopen"] as const) expect(werkrechtReden(st, "Duitsland")).toContain("Duitsland");
  });
});

describe("landen", () => {
  it("alleen codes uit de lijst, ook geen sleutels van een object", () => {
    expect(landUit("nl")).toBe("NL");
    expect(landUit(" de ")).toBe("DE");
    expect(landUit("XX")).toBeNull();
    expect(landUit("constructor")).toBeNull();
    expect(landUit(42)).toBeNull();
  });

  it("Nederland eerst, geen dubbele", () => {
    expect(WERK_LANDEN[0]).toBe("NL");
    expect(new Set(WERK_LANDEN).size).toBe(WERK_LANDEN.length);
  });

  it("landnaam in de taal van de werker", () => {
    expect(landNaam("NL", "nl")).toBe("Nederland");
    expect(landNaam("DE", "en")).toBe("Germany");
  });

  it("geldig tot: alleen een echte datum", () => {
    expect(geldigTotDag("2027-03-31")).toEqual({ jaar: 2027, maand: 3, dag: 31 });
    expect(geldigTotDag("2027-02-30")).toBeNull();
    expect(geldigTotDag("31-03-2027")).toBeNull();
    expect(geldigTotDag(null)).toBeNull();
  });
});

// --- opslag en de controle vóór een dienst ----------------------------------

const h = vi.hoisted(() => ({
  rij: null as object | null,
  idCheck: null as { id: string } | null,
  idStatus: "VERIFIED" as "VERIFIED" | "PENDING",
  opgeslagen: [] as unknown[],
  updates: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workRight: {
      findUnique: async () => h.rij,
      update: async (a: unknown) => {
        h.updates.push(a);
        return {};
      },
    },
    identityVerification: { findMany: async () => (h.idCheck ? [{ status: h.idStatus }] : []) },
    user: { findUnique: async () => ({ fullName: "Test Werker" }) },
  },
}));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (a: unknown) => {
    h.opgeslagen.push(a);
    return { id: "up_nieuw" };
  },
  deleteUpload: async () => undefined,
  readUpload: async () => ({ bytes: Buffer.alloc(0), filename: "x", mimeType: "image/png" }),
}));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: () => undefined }));
vi.mock("@/lib/flags", () => ({ featureEnabled: async () => true }));

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

describe("werkrecht-opslag", () => {
  beforeEach(() => {
    h.rij = null;
    h.idCheck = null;
    h.idStatus = "VERIFIED";
    h.opgeslagen = [];
    h.updates = [];
  });

  it("de controle vóór een dienst geeft een Nederlandse reden", async () => {
    const { werkrechtVoorWerk } = await import("@/lib/werkrecht/store");
    const zonder = await werkrechtVoorWerk("u1", "NL", NU);
    expect(zonder.ok).toBe(false);
    expect(zonder.reden).toContain("Nederland");

    h.rij = rij();
    h.idCheck = { id: "iv1" };
    expect(await werkrechtVoorWerk("u1", "NL", NU)).toEqual({ ok: true, reden: null });

    // dezelfde controle nog in behandeling: ingestuurd, maar nog niet aan het werk
    h.idStatus = "PENDING";
    const wacht = await werkrechtVoorWerk("u1", "NL", NU);
    expect(wacht.ok).toBe(false);
    expect(wacht.reden).toContain("nagekeken");
  });

  it("uploaden kan pas na de verklaring, met een geldige datum die niet voorbij is", async () => {
    const { bewijsOpslaan } = await import("@/lib/werkrecht/store");
    await expect(bewijsOpslaan("u1", "NL", { filename: "p.png", bytes: PNG, geldigTot: "2030-01-01" }, NU)).rejects.toThrow(/verklaring/);

    h.rij = { id: "wr1", uploadId: null, declaredAt: new Date("2026-11-01T10:00:00+01:00"), declaration: VERKLARING_VERSIE };
    await expect(bewijsOpslaan("u1", "NL", { filename: "p.png", bytes: PNG, geldigTot: "" }, NU)).rejects.toThrow(/geldig/);
    await expect(bewijsOpslaan("u1", "NL", { filename: "p.png", bytes: PNG, geldigTot: "2026-11-08" }, NU)).rejects.toThrow(/verlopen/);
    expect(h.opgeslagen).toHaveLength(0);

    await bewijsOpslaan("u1", "NL", { filename: "p.png", bytes: PNG, geldigTot: "2026-11-09" }, NU);
    expect(h.opgeslagen).toHaveLength(1);
    const data = (h.updates[0] as { data: { status: string; uploadId: string; validUntil: Date } }).data;
    expect(data.status).toBe("UPLOADED");
    expect(data.uploadId).toBe("up_nieuw");
    // geldig t/m 9 november: tot middernacht Nederlandse tijd
    expect(data.validUntil.toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });
});
