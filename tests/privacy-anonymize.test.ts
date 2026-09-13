import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    user: {
      id: "u1",
      fullName: "Jan de Vries",
      email: "jan@example.com",
      phone: "+31612345678",
      freelancerProfile: { id: "fp1", companyRegistrationId: "creg1" },
    } as Record<string, unknown> | null,
    profileUpdates: [] as Record<string, unknown>[],
    userUpdates: [] as Record<string, unknown>[],
    cregUpdates: [] as Record<string, unknown>[],
    auditUpdates: [] as Record<string, unknown>[],
    deleted: [] as string[],
    uploadsDeleted: [] as string[],
    audits: [] as Record<string, unknown>[],
  };

  const tx = {
    user: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.userUpdates.push(data);
        if (state.user) state.user.email = data.email as string;
        return {};
      },
    },
    freelancerProfile: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.profileUpdates.push(data);
        return {};
      },
      count: async () => 1,
    },
    companyRegistration: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.cregUpdates.push(data);
        return {};
      },
    },
    identityVerification: { deleteMany: async () => { state.deleted.push("kyc"); return { count: 2 }; } },
    deviceFingerprint: { deleteMany: async () => { state.deleted.push("device"); return { count: 1 }; } },
    passwordResetToken: { deleteMany: async () => ({ count: 0 }) },
    webPushSubscription: { deleteMany: async () => { state.deleted.push("push"); return { count: 3 }; } },
    certificate: { deleteMany: async () => ({ count: 1 }) },
    complianceDocument: { deleteMany: async () => ({ count: 2 }) },
    auditLog: {
      findMany: async () => [
        { id: "a1", summary: "Jan de Vries (jan@example.com) logde in" },
        { id: "a2", summary: "systeemtaak" },
      ],
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.auditUpdates.push(data);
        return {};
      },
    },
  };

  const prisma = {
    user: {
      findUnique: async () => state.user,
    },
    complianceDocument: { findMany: async () => [{ uploadId: "up1" }] },
    certificate: { findMany: async () => [{ uploadId: "up2" }] },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return { state, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/storage/local", () => ({
  deleteUpload: async (id: string) => {
    h.state.uploadsDeleted.push(id);
  },
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: async (a: Record<string, unknown>) => {
    h.state.audits.push(a);
  },
}));

import { anonymizeUser, scrubSummary } from "@/lib/privacy/anonymize";
import { retentionCutoff, erasableNow, retentionRule } from "@/lib/privacy/retention";

beforeEach(() => {
  h.state.user = {
    id: "u1",
    fullName: "Jan de Vries",
    email: "jan@example.com",
    phone: "+31612345678",
    freelancerProfile: { id: "fp1", companyRegistrationId: "creg1" },
  };
  h.state.profileUpdates.length = 0;
  h.state.userUpdates.length = 0;
  h.state.cregUpdates.length = 0;
  h.state.auditUpdates.length = 0;
  h.state.deleted.length = 0;
  h.state.uploadsDeleted.length = 0;
  h.state.audits.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("scrubSummary", () => {
  it("redacts every identifier and ignores short/empty ones", () => {
    expect(
      scrubSummary("Jan de Vries (jan@example.com) — id 7", [
        "Jan de Vries",
        "jan@example.com",
        "",
        null,
        "7",
      ]),
    ).toBe("[verwijderd] ([verwijderd]) — id 7");
  });
});

describe("anonymizeUser", () => {
  it("strips identifiers across every erasable model", async () => {
    const report = await anonymizeUser("u1", { actorUserId: "admin1" });

    expect(report.alreadyErased).toBe(false);
    expect(h.state.userUpdates[0]).toMatchObject({
      fullName: "Verwijderde gebruiker",
      email: "verwijderd-u1@verwijderd.zekerflex.invalid",
      phone: null,
      passwordHash: null,
    });
    expect(h.state.profileUpdates[0]).toMatchObject({
      payoutIban: null,
      stripeConnectedAccountId: null,
      homeLatitude: 0,
      homePostalCode: "0000XX",
      kvkNumber: "DELETED-u1",
    });
    expect(h.state.cregUpdates[0]).toMatchObject({ legalName: "[verwijderd]", city: null });
    expect(h.state.deleted).toEqual(expect.arrayContaining(["kyc", "device", "push"]));
    expect(h.state.uploadsDeleted).toEqual(expect.arrayContaining(["up1", "up2"]));

    // audit rows scrubbed, not deleted
    expect(h.state.auditUpdates[0]).toMatchObject({
      ipAddress: null,
      userAgent: null,
      summary: "[verwijderd] ([verwijderd]) logde in",
    });

    // statutory-hold categories are reported as retained
    expect(report.retained.map((r) => r.key)).toEqual(
      expect.arrayContaining(["invoices_payments", "timesheets", "model_agreements", "audit_log"]),
    );
    expect(h.state.audits[0]).toMatchObject({ action: "privacy.user.erased" });
  });

  it("is idempotent once the account is erased", async () => {
    h.state.user = {
      id: "u1",
      fullName: "Verwijderde gebruiker",
      email: "verwijderd-u1@verwijderd.zekerflex.invalid",
      phone: null,
      freelancerProfile: null,
    };
    const report = await anonymizeUser("u1");
    expect(report.alreadyErased).toBe(true);
    expect(h.state.userUpdates).toHaveLength(0);
  });
});

describe("retention schedule", () => {
  it("invoices are held for 7 years and block erasure", () => {
    const rule = retentionRule("invoices_payments");
    expect(rule?.days).toBe(7 * 365);
    expect(rule?.blocksErasure).toBe(true);
  });

  it("erasableNow excludes the statutory-hold categories", () => {
    const keys = erasableNow().map((r) => r.key);
    expect(keys).toContain("account");
    expect(keys).toContain("kyc");
    expect(keys).not.toContain("invoices_payments");
    expect(keys).not.toContain("audit_log");
  });

  it("retentionCutoff walks back by the rule's period", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const cut = retentionCutoff("device_fingerprint", now)!;
    expect(cut.toISOString()).toBe("2026-03-13T00:00:00.000Z"); // -180d
  });
});
