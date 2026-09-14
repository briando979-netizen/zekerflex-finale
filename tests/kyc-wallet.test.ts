import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createCredentialsRequest = vi.fn();
const generateJWK = vi.fn();
const generateNonce = vi.fn();
const processCredentials = vi.fn();
vi.mock("id-verifier", () => ({
  Claim: { GIVEN_NAME: "given_name", FAMILY_NAME: "family_name", BIRTH_DATE: "birth_date", DOCUMENT_NUMBER: "document_number", EXPIRY_DATE: "expiry_date", ISSUING_COUNTRY: "issuing_country" },
  DocumentType: { EU_PERSONAL_ID: "eu.europa.ec.eudi.pid.1", MOBILE_DRIVERS_LICENSE: "org.iso.18013.5.1.mDL", PHOTO_ID: "org.iso.23220.photoid.1" },
  createCredentialsRequest: (...a: unknown[]) => createCredentialsRequest(...a),
  generateJWK: (...a: unknown[]) => generateJWK(...a),
  generateNonce: (...a: unknown[]) => generateNonce(...a),
  processCredentials: (...a: unknown[]) => processCredentials(...a),
}));

// Real in-memory backing so "set then delete then get" behaves realistically,
// rather than mocking each call in isolation.
const kvStore = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => (kvStore.has(key) ? kvStore.get(key) : null),
  kvSet: async (key: string, value: unknown) => {
    kvStore.set(key, value);
  },
  kvDelete: async (key: string) => {
    kvStore.delete(key);
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { completeWalletVerification, consumeVerifiedWalletAttempt, startWalletVerification } from "@/lib/kyc/wallet";

const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const PAST = "2020-01-01";

function validResult(overrides: Partial<{ valid: boolean; trusted: boolean; given_name: string; family_name: string; expiry_date: string }> = {}) {
  const { valid = true, trusted = true, given_name = "Jan", family_name = "Jansen", expiry_date = FUTURE } = overrides;
  return {
    valid,
    trusted,
    claims: { given_name, family_name, birth_date: "1990-01-01", document_number: "AB1234567", expiry_date, issuing_country: "NL" },
    processedDocuments: [{ document: { docType: "eu.europa.ec.eudi.pid.1" }, claims: {}, valid, trusted }],
    sessionTranscript: {},
  };
}

beforeEach(() => {
  kvStore.clear();
  generateNonce.mockReturnValue("nonce-1");
  generateJWK.mockResolvedValue({ kty: "EC" });
  createCredentialsRequest.mockReturnValue({ mediation: "required", digital: { requests: [] } });
});
afterEach(() => vi.clearAllMocks());

describe("startWalletVerification", () => {
  it("stores a pending attempt keyed to the user and returns request params", async () => {
    const { attemptId, requestParams } = await startWalletVerification("user-1");
    expect(attemptId).toBeTruthy();
    expect(requestParams).toEqual({ mediation: "required", digital: { requests: [] } });
    expect(createCredentialsRequest).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "nonce-1", jwk: { kty: "EC" } }),
    );
  });
});

describe("completeWalletVerification", () => {
  it("accepts a valid, trusted, name-matching, unexpired credential", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult());

    const outcome = await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.claims?.givenName).toBe("Jan");
    expect(outcome.checks.every((c) => c.ok)).toBe(true);
  });

  it("rejects when the account name doesn't match the wallet claims", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult());

    const outcome = await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Someone Else",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.checks.find((c) => c.label === "Naam komt overeen")?.ok).toBe(false);
  });

  it("rejects an expired document", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult({ expiry_date: PAST }));

    const outcome = await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.checks.find((c) => c.label === "Geldigheid document")?.ok).toBe(false);
  });

  it("rejects an untrusted issuer even if the signature is valid", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult({ trusted: false }));

    const outcome = await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(outcome.ok).toBe(false);
  });

  it("degrades cleanly when the attempt is missing or expired", async () => {
    const outcome = await completeWalletVerification({
      userId: "user-1",
      attemptId: "does-not-exist",
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBeTruthy();
  });

  it("refuses to verify an attempt started by a different user", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult());

    const outcome = await completeWalletVerification({
      userId: "user-2",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(outcome.ok).toBe(false);
    expect(processCredentials).not.toHaveBeenCalled();
  });

  it("degrades cleanly when processCredentials itself throws", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockRejectedValue(new Error("decrypt failed"));

    const outcome = await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBeTruthy();
  });
});

describe("consumeVerifiedWalletAttempt", () => {
  it("returns the claims exactly once, then nothing", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult());
    await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    const first = await consumeVerifiedWalletAttempt("user-1", attemptId);
    expect(first?.givenName).toBe("Jan");

    const second = await consumeVerifiedWalletAttempt("user-1", attemptId);
    expect(second).toBeNull();
  });

  it("refuses a different user's attempt", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    processCredentials.mockResolvedValue(validResult());
    await completeWalletVerification({
      userId: "user-1",
      attemptId,
      credentials: { id: "c1", type: "digital-credential", protocol: "openid4vp-v1-unsigned", timestamp: "now" },
      origin: "https://zekerflex.com",
      accountFullName: "Jan Jansen",
    });

    expect(await consumeVerifiedWalletAttempt("user-2", attemptId)).toBeNull();
  });

  it("returns null for an attempt that was never completed", async () => {
    const { attemptId } = await startWalletVerification("user-1");
    expect(await consumeVerifiedWalletAttempt("user-1", attemptId)).toBeNull();
  });
});
