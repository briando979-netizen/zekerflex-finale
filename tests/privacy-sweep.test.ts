import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // drie verlopen controles: een met alle foto's, een al opgeschoond (wordt overgeslagen), een met alleen een score;
  // plus een nieuwe controle die dezelfde tweede selfie gebruikt als de eerste (die mag dus niet weg)
  const kycVerlopen = [
    { id: "iv-1", rawPayload: { uploadIds: { front: "voor-1", back: "achter-1", selfie: "selfie-1", selfie2: "selfie2-1" }, checks: [] }, livenessScore: null, faceMatchScore: 0.5, documentNumberHash: "h" },
    { id: "iv-2", rawPayload: { opgeschoond: true, uploadIds: { front: "voor-2" } }, livenessScore: null, faceMatchScore: null, documentNumberHash: null },
    { id: "iv-3", rawPayload: {}, livenessScore: 0.9, faceMatchScore: null, documentNumberHash: null },
  ];
  const kycNieuw = { id: "iv-nieuw", rawPayload: { uploadIds: { front: "voor-n", selfie: "selfie2-1" } }, livenessScore: null, faceMatchScore: null, documentNumberHash: null };
  const gewist: string[] = [];
  const calls: { model: string; op: string; where?: unknown; data?: unknown }[] = [];
  const mk = (model: string, count: number) => ({
    deleteMany: async ({ where }: { where: unknown }) => {
      calls.push({ model, op: "deleteMany", where });
      return { count };
    },
    updateMany: async ({ where, data }: { where: unknown; data: unknown }) => {
      calls.push({ model, op: "updateMany", where, data });
      return { count };
    },
    count: async ({ where }: { where: unknown }) => {
      calls.push({ model, op: "count", where });
      return count;
    },
  });
  return {
    calls,
    prisma: {
      gpsEvent: mk("gpsEvent", 5),
      deviceFingerprint: mk("deviceFingerprint", 2),
      engagementEvent: mk("engagementEvent", 9),
      passwordResetToken: mk("passwordResetToken", 1),
      identityVerification: {
        // met updatedAt in de where: de verlopen controles; zonder: alle controles met foto's (ook nieuwe)
        findMany: async ({ where }: { where: { updatedAt?: unknown } }) => {
          calls.push({ model: "identityVerification", op: "findMany", where });
          return where.updatedAt ? kycVerlopen : [...kycVerlopen, kycNieuw];
        },
        update: async ({ where, data }: { where: unknown; data: unknown }) => {
          calls.push({ model: "identityVerification", op: "update", where, data });
          return {};
        },
      },
      complianceDocument: { findMany: async () => [{ uploadId: "voor-1" }] },
      workRight: { findMany: async () => [] },
      certificate: { findMany: async () => [] },
      rijschoolLes: mk("rijschoolLes", 4),
      rijschoolBericht: mk("rijschoolBericht", 8),
      horecaReservering: mk("horecaReservering", 6),
      horecaBestelling: mk("horecaBestelling", 7),
      keyValueStore: {
        findMany: async () => [{ key: "site-reservering:s1:2025-09-08:r1" }, { key: "site-reservering:s1:2025-09-09:r2" }, { key: "site-reservering:s1:2026-12-01:r3" }],
        deleteMany: async ({ where }: { where: unknown }) => {
          calls.push({ model: "keyValueStore", op: "deleteMany", where });
          return { count: (where as { key: { in: string[] } }).key.in.length };
        },
      },
    },
    audits: [] as unknown[],
    gewist,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/storage/local", () => ({
  deleteUpload: async (id: string) => {
    h.gewist.push(id);
  },
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: async (a: unknown) => {
    h.audits.push(a);
  },
}));

import { runRetentionSweep } from "@/lib/privacy/sweep";

beforeEach(() => {
  h.calls.length = 0;
  h.audits.length = 0;
  h.gewist.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("runRetentionSweep", () => {
  const now = new Date("2026-09-09T00:00:00Z");

  it("deletes expired rows and minimises old KYC, then audits", async () => {
    const res = await runRetentionSweep({ now });

    expect(res.dryRun).toBe(false);
    expect(res.cleared).toMatchObject({
      gps_events: 5,
      device_fingerprint: 2,
      engagement_events: 9,
      password_reset_tokens: 1,
      kyc: 2,
      kyc_selfies: 1,
      rijschool_lesroutes: 4,
      rijschool_berichten: 8,
      horeca_gasten: 13,
      site_reserveringen: 1,
    });
    // klantsites: alleen reserveringen van vóór de grens, op de dag uit de sleutel
    expect(h.calls.find((c) => c.model === "keyValueStore")?.where).toEqual({ key: { in: ["site-reservering:s1:2025-09-08:r1"] } });

    // horeca: gastgegevens geanonimiseerd na 12 maanden (dag in NL-tijd), rijen blijven
    const res6 = h.calls.find((c) => c.model === "horecaReservering");
    expect(res6?.op).toBe("updateMany");
    expect(res6?.data).toEqual({ naam: "Gast", email: "", telefoon: "", opmerking: "" });
    expect((res6?.where as { datum: { lt: string } }).datum.lt).toBe("2025-09-09");
    const best = h.calls.find((c) => c.model === "horecaBestelling");
    expect(best?.op).toBe("updateMany");
    expect(best?.data).toEqual({ naam: "", opmerking: "" });
    expect((best?.where as { createdAt: { lt: Date } }).createdAt.lt.toISOString()).toBe("2025-09-09T00:00:00.000Z");

    // lesroutes: alleen de route weg (updateMany), de les zelf blijft
    const route = h.calls.find((c) => c.model === "rijschoolLes");
    expect(route?.op).toBe("updateMany");

    // berichten tussen leerling en rijschool: na 2 jaar helemaal weg
    const bericht = h.calls.find((c) => c.model === "rijschoolBericht");
    expect(bericht?.op).toBe("deleteMany");
    expect((bericht?.where as { createdAt: { lt: Date } }).createdAt.lt.toISOString()).toBe("2024-09-09T00:00:00.000Z");

    // KYC: per controle de payload terug tot de koppeling van voor- en achterkant; scores weg
    const kyc = h.calls.filter((c) => c.model === "identityVerification" && c.op === "update");
    expect(kyc.map((c) => (c.where as { id: string }).id)).toEqual(["iv-1", "iv-3"]);
    expect(kyc[0]?.data).toMatchObject({ rawPayload: { opgeschoond: true, uploadIds: { front: "voor-1", back: "achter-1" } }, faceMatchScore: null, documentNumberHash: null });
    expect(kyc[1]?.data).toMatchObject({ rawPayload: { opgeschoond: true }, livenessScore: null });
    // alleen de selfie die nergens anders meer hangt; de gedeelde selfie en de documentkanten blijven
    expect(h.gewist).toEqual(["selfie-1"]);

    // gps cutoff is now - 2y
    const gps = h.calls.find((c) => c.model === "gpsEvent");
    expect((gps?.where as { recordedAt: { lt: Date } }).recordedAt.lt.getUTCFullYear()).toBe(2024);

    expect(res.pending).toContain("invoices_payments");
    expect(h.audits).toHaveLength(1);
  });

  it("dryRun counts without deleting or auditing", async () => {
    const res = await runRetentionSweep({ now, dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(h.calls.every((c) => c.op === "count" || c.op === "findMany")).toBe(true);
    expect(res.cleared).toMatchObject({ kyc: 2, kyc_selfies: 1 });
    expect(h.gewist).toEqual([]);
    expect(h.audits).toHaveLength(0);
  });
});
