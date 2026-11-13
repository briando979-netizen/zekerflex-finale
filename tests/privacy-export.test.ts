import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prefs/store", () => ({
  getPrefs: async () => ({ jobAlerts: [], quietHours: null }),
}));
vi.mock("@/lib/prisma", () => {
  const many = (rows: unknown[]) => vi.fn().mockResolvedValue(rows);
  return {
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "u1",
        email: "jan@example.com",
        fullName: "Jan de Vries",
        phone: "+31612345678",
        kycStatus: "VERIFIED",
      }),
    },
    freelancerProfile: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ id: "fp1" }) // fpId lookup
        .mockResolvedValue({ id: "fp1", skills: [], companyRegistration: null }),
    },
    membership: { findMany: many([{ role: "FREELANCER", tenantId: "t1" }]) },
    identityVerification: { findMany: many([{ status: "VERIFIED", decisionStatus: "Approved" }]) },
    certificate: { findMany: many([{ type: "VCA", status: "VALID" }]) },
    complianceDocument: { findMany: many([{ kind: "ID", status: "APPROVED" }]) },
    workRight: { findMany: many([{ country: "NL", status: "APPROVED" }]) },
    shiftAssignment: { findMany: many([{ shiftId: "s1", source: "ACCEPTED" }]) },
    timesheet: { findMany: many([{ id: "ts1", status: "PAID", billableMinutes: 300 }]) },
    shiftMatch: { findMany: many([{ shiftId: "s1", status: "ACCEPTED", score: 0.9 }]) },
    modelAgreement: { findMany: many([{ reference: "ZF-MOD-1" }]) },
    invoice: { findMany: many([{ number: "ZF-SB-1", totalCents: 29040 }]) },
    engagementEvent: { findMany: many([{ kind: "OFFER_RESPONDED", occurredAt: new Date() }]) },
    webPushSubscription: { findMany: many([{ endpoint: "https://push/1" }]) },
    payslipRecord: { findMany: many([]) },
    passkey: { findMany: vi.fn().mockResolvedValue([{ name: "iPhone", transports: ["internal"], backedUp: true, createdAt: new Date(), lastUsedAt: null }]) },
    deviceFingerprint: { findMany: many([{ hardwareHash: "abc", platform: "android" }]) },
    dispute: { findMany: many([]) },
    auditLog: { findMany: many([{ action: "auth.login.succeeded", summary: "ok" }]) },
    keyValueStore: {
      findMany: many([
        { key: "ritten:u1", value: { t1: { km: 12 } }, updatedAt: new Date() },
        { key: "auth-2fa:u1", value: { secret: "JBSWY3DPEHPK3PXP" }, updatedAt: new Date() },
        { key: "mail-tools:u1", value: { signature: "Groet, Jan", smtpPassword: "geheim" }, updatedAt: new Date() },
        // "u1" komt ook voor in een ander id — hoort niet bij deze persoon
        { key: "agenda:u12:x", value: { title: "van iemand anders" }, updatedAt: new Date() },
      ]),
    },
  },
  };
});

import { exportUserData, exportFilename } from "@/lib/privacy/export";
import { prisma } from "@/lib/prisma";

afterEach(() => vi.clearAllMocks());

describe("exportUserData", () => {
  it("gathers every section for the subject", async () => {
    const out = await exportUserData("u1");

    expect(out.subject.userId).toBe("u1");
    expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const s = out.sections as Record<string, unknown>;
    expect(s.account).toMatchObject({ email: "jan@example.com" });
    expect(s.account).not.toHaveProperty("passwordHash");
    expect(s.memberships).toHaveLength(1);
    expect(s.timesheets).toHaveLength(1);
    expect(s.invoices).toHaveLength(1);
    expect(s.auditTrail).toHaveLength(1);
    expect(s.webPushSubscriptions).toHaveLength(1);
    // de lijst toestellen (passkeys) wel, de publieke sleutel en teller niet
    expect(s.passkeys).toEqual([expect.objectContaining({ name: "iPhone", backedUp: true })]);
    const passkeyVraag = vi.mocked((prisma as unknown as { passkey: { findMany: (a: unknown) => unknown } }).passkey.findMany).mock.calls[0]?.[0] as { select: Record<string, boolean> };
    expect(passkeyVraag.select).not.toHaveProperty("publicKey");
    expect(passkeyVraag.select).not.toHaveProperty("signCount");

    const stored = s.storedSettings as { key: string; value: unknown }[];
    expect(stored.map((r) => r.key)).toEqual(["ritten:u1", "auth-2fa:u1", "mail-tools:u1"]);
    expect(stored[0]!.value).toEqual({ t1: { km: 12 } });
    expect(stored[1]!.value).toBe("[afgeschermd]");
    expect(stored[2]!.value).toEqual({ signature: "Groet, Jan", smtpPassword: "[afgeschermd]" });
  });

  it("ID-gegevens: eigen gegevens erbij, nooit rawPayload, hashes, id_number of mrz", async () => {
    (prisma.identityVerification.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        provider: "STRIPE",
        status: "VERIFIED",
        decisionStatus: "verified",
        documentType: "PASSPORT",
        createdAt: new Date("2026-11-01T10:00:00+01:00"),
        documentNumberHash: "h1",
        bsnHash: "h2",
        bsnVoorstelHash: "h3",
        rawPayload: {
          id_number: "123456782",
          mrz: "P<NLD<<<",
          uploadIds: { front: "u1" },
          stripeKopie: { document: { voornamen: "Jan", achternaam: "de Vries", geboortedatum: "1990-02-03", nummerEind: "A1B", id_number: "123456782" } },
        },
      },
    ]);
    const out = await exportUserData("u1");
    const rijen = (out.sections as Record<string, unknown>).identityVerification as Record<string, unknown>[];
    expect(rijen[0]).toMatchObject({ naam: "Jan de Vries", geboortedatum: "1990-02-03", nummerEindigtOp: "A1B" });
    const json = JSON.stringify(out.sections.identityVerification);
    for (const k of ["rawPayload", "documentNumberHash", "id_number", "mrz", "bsnHash", "bsnVoorstelHash"]) expect(json).not.toContain(`"${k}"`);
    expect(json).not.toContain("123456782");
  });

  it("filename is dated and namespaced", () => {
    expect(exportFilename("u1", new Date("2026-09-09T12:00:00Z"))).toBe(
      "zekerflex-gegevens-u1-2026-09-09.json",
    );
  });

  it("a failing section is captured, not thrown", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db gone"),
    );
    const out = await exportUserData("u1");
    expect((out.sections as Record<string, unknown>).auditTrail).toMatchObject({
      error: "db gone",
    });
  });
});
