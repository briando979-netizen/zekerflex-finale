import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { decodeSession, encodeSession } from "@/lib/auth/session";

describe("session version claims", () => {
  it("round-trips the authoritative session version", async () => {
    const token = await encodeSession({
      sub: "user-a", email: "a@example.test", name: "A", roles: [], sessionVersion: 4,
    });
    expect(await decodeSession(token)).toMatchObject({ sub: "user-a", sessionVersion: 4 });
  });

  it("rejects legacy tokens without a session version", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const legacy = await new SignJWT({ email: "a@example.test", name: "A", roles: [] })
      .setProtectedHeader({ alg: "HS256" }).setSubject("user-a")
      .setIssuer("zekerflex").setAudience("zekerflex.app").setExpirationTime("5m").sign(secret);
    expect(await decodeSession(legacy)).toBeNull();
  });
});
