import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ID photos / KVK-or-btw / Stripe Identity:
//  1. uploads on Vercel go to Postgres instead of the read-only disk
//  2. EU btw-nummer check against VIES
//  3. Stripe Identity webhook → account status

const db = vi.hoisted(() => ({
  blobs: new Map<string, Buffer>(),
  uploads: new Map<string, Record<string, unknown>>(),
  idv: [] as Record<string, unknown>[],
  users: new Map<string, Record<string, unknown>>(),
  audit: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { STORAGE_BACKEND: "local", UPLOADS_DIR: "uploads", UPLOAD_MAX_BYTES: 10_000_000, STRIPE_SECRET_KEY: "sk_test_x", APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/storage/s3", () => ({ putObject: vi.fn(), getObjectBytes: vi.fn(), deleteObject: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => db.audit(...a) }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({ identity: { verificationSessions: { retrieve: db.retrieve } } }) }));
vi.mock("@/lib/onboarding/verify", () => ({
  nameSimilarity: (a: string, b: string) => (a.toLowerCase() === b.toLowerCase() ? 1 : 0),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (strings.join("?").startsWith("INSERT")) db.blobs.set(vals[0] as string, vals[1] as Buffer);
      else db.blobs.delete(vals[0] as string);
      return 1;
    },
    $queryRaw: async (_s: TemplateStringsArray, key: string) => (db.blobs.has(key) ? [{ bytes: db.blobs.get(key) }] : []),
    upload: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `u${db.uploads.size + 1}`, ...data };
        db.uploads.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.uploads.get(where.id) ?? null,
    },
    identityVerification: {
      findUnique: async ({ where }: { where: { sessionId: string } }) => db.idv.find((r) => r.sessionId === where.sessionId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.idv.find((r) => r.id === where.id)!, data),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.users.get(where.id)!, data),
    },
  },
}));

import { readUpload, storageBackend, storeUpload } from "@/lib/storage/local";
import { checkVies, normaliseVat } from "@/lib/integrations/vies";
import { handleStripeIdentityEvent } from "@/lib/kyc/stripe-identity";

describe("upload storage on a serverless host", () => {
  beforeEach(() => vi.stubEnv("VERCEL", "1"));
  afterEach(() => vi.unstubAllEnvs());

  it("stores ID photos in the database instead of the read-only disk", async () => {
    expect(storageBackend()).toBe("db");
    const bytes = Buffer.from("fake-jpeg-bytes");
    const up = await storeUpload({ filename: "voorkant.jpg", mimeType: "image/jpeg", bytes });
    expect(up.storageKey.startsWith("db:")).toBe(true);
    const back = await readUpload(up.id);
    expect(back.bytes.equals(bytes)).toBe(true);
    expect(back.mimeType).toBe("image/jpeg");
  });

  it("keeps the local disk when not on a serverless host", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("VERCEL", "");
    expect(storageBackend()).toBe("local");
  });
});

describe("EU btw-nummer (VIES)", () => {
  it("normalises spaces, dots and the Greek prefix", () => {
    expect(normaliseVat("pl 526-025.0995")?.vatNumber).toBe("PL5260250995");
    expect(normaliseVat("GR123456789")?.countryCode).toBe("EL");
    expect(normaliseVat("US123456789")).toBeNull();
    expect(normaliseVat("12345678")).toBeNull();
  });

  it("valid / invalid / unavailable / malformed", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ isValid: true, name: "JAN  KOWALSKI", address: "---" })));
    const r1 = await checkVies("PL5260250995", ok as unknown as typeof fetch);
    expect(r1).toMatchObject({ status: "valid", name: "JAN KOWALSKI", address: null });
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain("/ms/PL/vat/5260250995");

    const bad = async () => new Response(JSON.stringify({ isValid: false }));
    expect((await checkVies("PL1111111111", bad as unknown as typeof fetch)).status).toBe("invalid");

    const down = async () => new Response(JSON.stringify({ userError: "MS_UNAVAILABLE" }));
    expect((await checkVies("RO12345678", down as unknown as typeof fetch)).status).toBe("unavailable");
    const err = async () => {
      throw new Error("timeout");
    };
    expect((await checkVies("RO12345678", err as unknown as typeof fetch)).status).toBe("unavailable");

    expect((await checkVies("hallo")).status).toBe("malformed");
  });
});

describe("Stripe Identity webhook", () => {
  beforeEach(() => {
    db.idv.length = 0;
    db.users.clear();
    db.audit.mockReset();
    db.idv.push({ id: "iv1", sessionId: "vs_1", userId: "user1", status: "PENDING" });
    db.users.set("user1", { id: "user1", fullName: "Anna de Vries", kycStatus: "PENDING" });
  });
  const ev = (type: string, extra: Record<string, unknown> = {}) =>
    ({ type, data: { object: { id: "vs_1", ...extra } } }) as never;

  it("verified + matching name → account VERIFIED", async () => {
    db.retrieve.mockResolvedValue({
      verified_outputs: { first_name: "Anna", last_name: "de Vries" },
      last_verification_report: { document: { type: "passport", expiration_date: { year: 2030, month: 5, day: 1 } } },
    });
    await handleStripeIdentityEvent(ev("identity.verification_session.verified"));
    expect(db.users.get("user1")!.kycStatus).toBe("VERIFIED");
    expect(db.idv[0]).toMatchObject({ status: "VERIFIED", documentType: "PASSPORT", decisionStatus: "verified" });
  });

  it("verified but another name on the document → stays PENDING for manual review", async () => {
    db.retrieve.mockResolvedValue({ verified_outputs: { first_name: "Piet", last_name: "Jansen" }, last_verification_report: null });
    await handleStripeIdentityEvent(ev("identity.verification_session.verified"));
    expect(db.users.get("user1")!.kycStatus).toBe("PENDING");
    expect(db.idv[0]!.decisionStatus).toBe("name_mismatch");
  });

  it("requires_input stores the reason for the verification page", async () => {
    await handleStripeIdentityEvent(ev("identity.verification_session.requires_input", { last_error: { reason: "Document te wazig" } }));
    expect(db.idv[0]).toMatchObject({ decisionStatus: "requires_input" });
    expect((db.idv[0]!.rawPayload as { reason: string }).reason).toBe("Document te wazig");
  });

  it("ignores sessions it did not start", async () => {
    await handleStripeIdentityEvent({ type: "identity.verification_session.verified", data: { object: { id: "vs_other" } } } as never);
    expect(db.audit).not.toHaveBeenCalled();
  });
});
