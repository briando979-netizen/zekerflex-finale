import { afterEach, describe, expect, it, vi } from "vitest";

// The auto-match candidate pool used to require vatValid+kvkValid outright —
// which an uitzendkracht never has by design (ZekerFlex is their employer),
// so they could never be auto-matched/notified for any shift at all, only
// ever find work by browsing the marketplace themselves.

const getFiscal = vi.fn();
vi.mock("@/lib/fiscal/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fiscal/store")>();
  return { ...actual, getFiscal: (...a: unknown[]) => getFiscal(...a) };
});

import { isMatchEligibleWorker } from "@/lib/matching/engine";

afterEach(() => vi.clearAllMocks());

describe("isMatchEligibleWorker", () => {
  it("accepts a zzp'er with valid KVK+btw on a regular shift without a fiscal lookup", async () => {
    const ok = await isMatchEligibleWorker({ userId: "u1", vatValid: true, kvkValid: true, country: "NL" }, false);
    expect(ok).toBe(true);
    expect(getFiscal).not.toHaveBeenCalled();
  });

  it("accepts an uitzendkracht (no KVK/btw) on a regular shift", async () => {
    getFiscal.mockResolvedValue({ workerKind: "uitzendkracht" });
    const ok = await isMatchEligibleWorker({ userId: "u2", vatValid: false, kvkValid: false, country: "NL" }, false);
    expect(ok).toBe(true);
  });

  it("rejects a zzp'er without valid KVK+btw who also isn't an uitzendkracht", async () => {
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    const ok = await isMatchEligibleWorker({ userId: "u3", vatValid: false, kvkValid: false, country: "NL" }, false);
    expect(ok).toBe(false);
  });

  it("rejects a zzp'er with valid KVK+btw on a uitzendbureau-only shift", async () => {
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    const ok = await isMatchEligibleWorker({ userId: "u4", vatValid: true, kvkValid: true, country: "NL" }, true);
    expect(ok).toBe(false);
  });

  it("accepts an uitzendkracht on a uitzendbureau-only shift", async () => {
    getFiscal.mockResolvedValue({ workerKind: "uitzendkracht" });
    const ok = await isMatchEligibleWorker({ userId: "u5", vatValid: false, kvkValid: false, country: "NL" }, true);
    expect(ok).toBe(true);
  });

  // Een zzp'er uit het buitenland heeft geen KVK: de onboarding telt een geldig
  // EU-btw-nummer (VIES) als inschrijving, maar zette kvkValid nooit.
  it("accepts a zzp'er from abroad with a valid EU VAT number but no KVK", async () => {
    const ok = await isMatchEligibleWorker({ userId: "u6", vatValid: true, kvkValid: false, country: "PL" }, false);
    expect(ok).toBe(true);
    expect(getFiscal).not.toHaveBeenCalled();
  });

  it("still needs a KVK for a Dutch zzp'er with only a VAT number", async () => {
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    const ok = await isMatchEligibleWorker({ userId: "u7", vatValid: true, kvkValid: false, country: "NL" }, false);
    expect(ok).toBe(false);
  });

  it("rejects a zzp'er from abroad whose VAT number is not valid", async () => {
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    const ok = await isMatchEligibleWorker({ userId: "u8", vatValid: false, kvkValid: false, country: "PL" }, false);
    expect(ok).toBe(false);
  });
});
