import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// next-auth is pinned to a pre-release (5.0.0-beta.32) — there is no stable
// v5 and "latest" is a downgrade to v4 (see docs/DEPENDENCIES.md). These tests
// lock in the behaviour we actually rely on from our own NextAuth hooks so a
// beta bump that changes the contract fails here instead of in production:
//
//   * the credentials `authorize` — throttle -> bcrypt -> audit -> role load
//   * `jwt.encode` / `jwt.decode` — must mint/read exactly the jose HS256
//     tokens the Edge middleware verifies (lib/auth/session)
//   * `callbacks.jwt` / `callbacks.session` — role propagation
//   * the Google `signIn` gate — verified-email + DB-account binding
// ---------------------------------------------------------------------------

// next-auth's runtime does `import "next/server"` (a subpath Vitest's resolver
// can't follow) the moment it's loaded. We don't need the framework here — the
// config object under test is entirely our own code — so stub the package and
// its provider factories with thin pass-throughs. `NextAuth(authOptions)` then
// becomes a no-op and `authOptions` stays 100% our logic.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: Record<string, unknown>) => ({ id: "credentials", type: "credentials", ...config }),
}));
vi.mock("next-auth/providers/google", () => ({
  default: (config: Record<string, unknown>) => ({ id: "google", type: "oidc", ...config }),
}));

const userFindFirst = vi.fn();
const userUpdate = vi.fn();
const userCreate = vi.fn();
const membershipFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
  },
}));

const bcryptCompare = vi.fn();
vi.mock("bcryptjs", () => ({
  default: { compare: (...a: unknown[]) => bcryptCompare(...a) },
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const recordLoginFailure = vi.fn();
vi.mock("@/lib/metrics", () => ({ recordLoginFailure: (...a: unknown[]) => recordLoginFailure(...a) }));

const checkLoginAllowed = vi.fn();
const registerLoginFailure = vi.fn();
const clearLoginFailures = vi.fn();
vi.mock("@/lib/auth/login-throttle", () => ({
  MAX_FAILURES: 5,
  checkLoginAllowed: (...a: unknown[]) => checkLoginAllowed(...a),
  registerLoginFailure: (...a: unknown[]) => registerLoginFailure(...a),
  clearLoginFailures: (...a: unknown[]) => clearLoginFailures(...a),
}));

import { authOptions } from "@/lib/auth/nextauth";
import { decodeSession, encodeSession } from "@/lib/auth/session";
import type { RoleGrant } from "@/lib/auth/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const credentialsProvider = (authOptions.providers as any[]).find(
  (p) => (typeof p === "function" ? p() : p).id === "credentials" || (typeof p === "function" ? p() : p).type === "credentials",
);
// The Credentials provider is a plain config object in v5.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authorize: (raw: Record<string, unknown>) => Promise<any> =
  (credentialsProvider as any)?.authorize ?? (authOptions.providers as any[])[0].authorize;

const GRANT: RoleGrant = { role: "FREELANCER", organizationId: "org_platform", locationIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  checkLoginAllowed.mockResolvedValue({ allowed: true });
  registerLoginFailure.mockResolvedValue({ failures: 1, locked: false });
  membershipFindMany.mockResolvedValue([
    { role: "FREELANCER", tenantId: "org_platform", scopedBranches: [] },
  ]);
});

describe("credentials authorize", () => {
  const creds = { email: "Jan@Example.NL", password: "hunter2", remember: "1" };

  it("returns the DB account + freshly-loaded grants on a correct password", async () => {
    userFindFirst.mockResolvedValue({ id: "usr_1", email: "jan@example.nl", fullName: "Jan", passwordHash: "hash" });
    bcryptCompare.mockResolvedValue(true);

    const res = await authorize(creds);

    expect(res).toMatchObject({ id: "usr_1", email: "jan@example.nl", name: "Jan", remember: true });
    expect(res.roles).toEqual([GRANT]);
    // e-mail is normalised before the lookup
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: "jan@example.nl", disabledAt: null }) }),
    );
    expect(clearLoginFailures).toHaveBeenCalledWith("jan@example.nl");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.succeeded" }));
  });

  it("returns null + records a failure on a wrong password (never reveals which)", async () => {
    userFindFirst.mockResolvedValue({ id: "usr_1", email: "jan@example.nl", fullName: "Jan", passwordHash: "hash" });
    bcryptCompare.mockResolvedValue(false);

    expect(await authorize(creds)).toBeNull();
    expect(registerLoginFailure).toHaveBeenCalledWith("jan@example.nl");
    expect(recordLoginFailure).toHaveBeenCalled();
    expect(clearLoginFailures).not.toHaveBeenCalled();
  });

  it("returns null for an unknown account but still burns a throttle slot (no user enumeration)", async () => {
    userFindFirst.mockResolvedValue(null);

    expect(await authorize(creds)).toBeNull();
    expect(bcryptCompare).not.toHaveBeenCalled();
    expect(registerLoginFailure).toHaveBeenCalledWith("jan@example.nl");
  });

  it("refuses outright when the account is locked out, without touching bcrypt", async () => {
    checkLoginAllowed.mockResolvedValue({ allowed: false, retryAfterSeconds: 900 });

    expect(await authorize(creds)).toBeNull();
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(bcryptCompare).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.locked" }));
  });

  it("rejects malformed input before any DB work", async () => {
    expect(await authorize({ email: "not-an-email", password: "" })).toBeNull();
    expect(checkLoginAllowed).not.toHaveBeenCalled();
  });
});

describe("jwt.encode / jwt.decode — must be our jose session tokens", () => {
  const encode = authOptions.jwt!.encode!;
  const decode = authOptions.jwt!.decode!;

  it("encode mints a token that lib/auth/session (the Edge verifier) accepts", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jwt = (await encode({ token: { sub: "usr_1", email: "a@b.nl", name: "A", roles: [GRANT], remember: true } } as any)) as string;

    const claims = await decodeSession(jwt);
    expect(claims).toMatchObject({ sub: "usr_1", email: "a@b.nl", name: "A", remember: true });
    expect(claims!.roles).toEqual([GRANT]);
  });

  it("encode returns an empty string when there is no subject (no anonymous cookie)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await encode({ token: {} } as any)).toBe("");
  });

  it("decode round-trips a token produced by encodeSession", async () => {
    const jwt = await encodeSession({ sub: "usr_9", email: "x@y.nl", name: "X", roles: [GRANT] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await decode({ token: jwt } as any)) as any;
    expect(out).toMatchObject({ sub: "usr_9", email: "x@y.nl", name: "X", roles: [GRANT] });
  });

  it("decode rejects a garbage / forged token", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await decode({ token: "not.a.jwt" } as any)).toBeNull();
  });
});

describe("callbacks.jwt / callbacks.session — role propagation", () => {
  it("jwt copies the credentials roles onto the token on first sign-in", async () => {
    const cb = authOptions.callbacks!.jwt!;
    const token = await cb({
      token: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: "usr_1", email: "a@b.nl", name: "A", roles: [GRANT], remember: true } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(token).toMatchObject({ sub: "usr_1", roles: [GRANT], remember: true });
  });

  it("jwt reloads grants from the DB on an explicit session update", async () => {
    membershipFindMany.mockResolvedValue([
      { role: "HQ_ADMIN", tenantId: "org_a", scopedBranches: [{ branchId: "b1" }] },
    ]);
    const cb = authOptions.callbacks!.jwt!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = await cb({ token: { sub: "usr_1" }, trigger: "update" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((token as any).roles).toEqual([
      { role: "HQ_ADMIN", organizationId: "org_a", locationIds: ["b1"] },
    ]);
  });

  it("session exposes id + roles from the token to the app", async () => {
    const cb = authOptions.callbacks!.session!;
    const session = await cb({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session: { user: {} } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      token: { sub: "usr_1", roles: [GRANT] } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((session as any).user).toMatchObject({ id: "usr_1", roles: [GRANT] });
  });
});

describe("callbacks.signIn — Google gate", () => {
  const signIn = () => authOptions.callbacks!.signIn!;

  it("lets a plain credentials sign-in through untouched", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await signIn()({ account: { provider: "credentials" } } as any)).toBe(true);
  });

  it("blocks a Google identity whose e-mail Google itself marks unverified", async () => {
    const res = await signIn()({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account: { provider: "google" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profile: { email: "spoof@gmail.com", email_verified: false } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: {} as any,
    } as any);
    expect(res).toBe(false);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("accepts a verified Google e-mail that maps to an existing enabled account", async () => {
    userFindFirst.mockResolvedValue({ id: "usr_1", fullName: "Jan", email: "jan@example.nl" });
    userUpdate.mockResolvedValue({});
    const res = await signIn()({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account: { provider: "google" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profile: { email: "jan@example.nl", email_verified: true, name: "Jan" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: {} as any,
    } as any);
    expect(res).toBe(true);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.succeeded" }));
  });
});
