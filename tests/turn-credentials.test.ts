import { createHmac } from "crypto";
import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  TURN_HOST: undefined as string | undefined,
  TURN_SHARED_SECRET: undefined as string | undefined,
  TURN_REALM: "zekerflex.com",
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

import { mintTurnCredential } from "@/lib/calls/turn-credentials";

describe("mintTurnCredential", () => {
  it("returns null when TURN isn't configured", () => {
    envMock.TURN_HOST = undefined;
    envMock.TURN_SHARED_SECRET = undefined;
    expect(mintTurnCredential("user1")).toBeNull();
  });

  it("returns null when only one of TURN_HOST/TURN_SHARED_SECRET is set", () => {
    envMock.TURN_HOST = "turn.example.com";
    envMock.TURN_SHARED_SECRET = undefined;
    expect(mintTurnCredential("user1")).toBeNull();
  });

  it("mints a time-limited credential whose password matches coturn's HMAC convention", () => {
    envMock.TURN_HOST = "turn.example.com";
    envMock.TURN_SHARED_SECRET = "s3cret-shared-value";

    const before = Math.floor(Date.now() / 1000);
    const cred = mintTurnCredential("user1");
    expect(cred).not.toBeNull();
    expect(cred!.urls).toEqual([
      "turn:turn.example.com:3478?transport=udp",
      "turn:turn.example.com:3478?transport=tcp",
    ]);

    const [expiryRaw, userId] = cred!.username.split(":");
    expect(userId).toBe("user1");
    expect(Number(expiryRaw)).toBeGreaterThanOrEqual(before + 3600);

    const expected = createHmac("sha1", "s3cret-shared-value").update(cred!.username).digest("base64");
    expect(cred!.credential).toBe(expected);
  });

  it("scopes the username to the given userId so two users never share a credential", () => {
    envMock.TURN_HOST = "turn.example.com";
    envMock.TURN_SHARED_SECRET = "s3cret-shared-value";

    const a = mintTurnCredential("user1")!;
    const b = mintTurnCredential("user2")!;
    expect(a.username).not.toBe(b.username);
    expect(a.credential).not.toBe(b.credential);
  });
});
