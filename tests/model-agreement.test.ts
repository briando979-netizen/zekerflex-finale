import { describe, expect, it } from "vitest";
import { nextStatusAfterSignature } from "@/lib/agreements/model-agreement";

describe("nextStatusAfterSignature", () => {
  const t = new Date("2026-08-01T10:00:00Z");

  it("stays pending on the freelancer until they sign", () => {
    expect(nextStatusAfterSignature(null, null)).toBe(
      "PENDING_FREELANCER_SIGNATURE",
    );
  });

  it("moves to the client once the freelancer signs", () => {
    expect(nextStatusAfterSignature(t, null)).toBe("PENDING_CLIENT_SIGNATURE");
  });

  it("is active only when both parties have signed", () => {
    expect(nextStatusAfterSignature(t, t)).toBe("ACTIVE");
  });

  it("a lone client signature still waits on the freelancer", () => {
    expect(nextStatusAfterSignature(null, t)).toBe(
      "PENDING_FREELANCER_SIGNATURE",
    );
  });
});
