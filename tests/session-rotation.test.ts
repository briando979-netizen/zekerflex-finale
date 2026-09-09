import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// AUTH_SECRET / AUTH_SECRET_PREVIOUS key rotation (lib/auth/session.ts).
// Both constants are read from process.env at module load time, so each
// scenario here sets the env vars first and then dynamically re-imports the
// module (vi.resetModules) to get a fresh copy with those values baked in —
// mirroring how a real key rotation plays out across a deploy.
// ---------------------------------------------------------------------------

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_AUTH_SECRET_PREVIOUS = process.env.AUTH_SECRET_PREVIOUS;

const OLD_SECRET = "old-secret-0000000000000000000000000000000";
const NEW_SECRET = "new-secret-1111111111111111111111111111111";
const UNRELATED_SECRET = "unrelated-secret-22222222222222222222222222";

async function freshSessionModule() {
  vi.resetModules();
  return import("@/lib/auth/session");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  if (ORIGINAL_AUTH_SECRET_PREVIOUS === undefined) delete process.env.AUTH_SECRET_PREVIOUS;
  else process.env.AUTH_SECRET_PREVIOUS = ORIGINAL_AUTH_SECRET_PREVIOUS;
});

const INPUT = { sub: "usr_1", email: "u@x.nl", name: "U", roles: [] };

describe("session key rotation", () => {
  it("a token signed before rotation still verifies once AUTH_SECRET_PREVIOUS carries the old value", async () => {
    process.env.AUTH_SECRET = OLD_SECRET;
    delete process.env.AUTH_SECRET_PREVIOUS;
    const before = await freshSessionModule();
    const token = await before.encodeSession(INPUT);

    process.env.AUTH_SECRET = NEW_SECRET;
    process.env.AUTH_SECRET_PREVIOUS = OLD_SECRET;
    const after = await freshSessionModule();
    const claims = await after.decodeSession(token);

    expect(claims?.sub).toBe("usr_1");
  });

  it("a new token is signed with the new secret, not a retired one", async () => {
    process.env.AUTH_SECRET = NEW_SECRET;
    process.env.AUTH_SECRET_PREVIOUS = OLD_SECRET;
    const mod = await freshSessionModule();
    const token = await mod.encodeSession(INPUT);
    const claims = await mod.decodeSession(token);
    expect(claims?.sub).toBe("usr_1");
  });

  it("a token signed with neither the current nor a retired secret is rejected", async () => {
    process.env.AUTH_SECRET = UNRELATED_SECRET;
    delete process.env.AUTH_SECRET_PREVIOUS;
    const forged = await freshSessionModule();
    const token = await forged.encodeSession(INPUT);

    process.env.AUTH_SECRET = NEW_SECRET;
    process.env.AUTH_SECRET_PREVIOUS = OLD_SECRET;
    const real = await freshSessionModule();
    expect(await real.decodeSession(token)).toBeNull();
  });

  it("supports more than one retired secret at once (overlapping rotations)", async () => {
    process.env.AUTH_SECRET = OLD_SECRET;
    delete process.env.AUTH_SECRET_PREVIOUS;
    const oldest = await freshSessionModule();
    const token = await oldest.encodeSession(INPUT);

    process.env.AUTH_SECRET = NEW_SECRET;
    process.env.AUTH_SECRET_PREVIOUS = `${UNRELATED_SECRET},${OLD_SECRET}`;
    const current = await freshSessionModule();
    expect((await current.decodeSession(token))?.sub).toBe("usr_1");
  });

  it("once a retired secret is fully removed, its tokens stop verifying", async () => {
    process.env.AUTH_SECRET = OLD_SECRET;
    delete process.env.AUTH_SECRET_PREVIOUS;
    const before = await freshSessionModule();
    const token = await before.encodeSession(INPUT);

    process.env.AUTH_SECRET = NEW_SECRET;
    delete process.env.AUTH_SECRET_PREVIOUS; // rotation window closed
    const after = await freshSessionModule();
    expect(await after.decodeSession(token)).toBeNull();
  });
});
