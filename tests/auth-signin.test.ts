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
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: Record<string, unknown>) => ({ id: "credentials", type: "credentials", ...config }),
}));
vi.mock("next-auth/providers/google", () => ({
  default: (config: Record<string, unknown>) => ({ id: "google", type: "oidc", ...config }),
}));
// zoals de echte: de config blijft als `options` bewaard (dus de getter van clientSecret ook)
vi.mock("next-auth/providers/apple", () => ({
  default: (config: Record<string, unknown>) => ({ id: "apple", type: "oidc", options: config }),
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

const featureEnabled = vi.fn();
vi.mock("@/lib/flags", () => ({ featureEnabled: (...a: unknown[]) => featureEnabled(...a) }));

const sendVerificationEmail = vi.fn();
const sendWelcomeToUser = vi.fn();
vi.mock("@/lib/auth/email-verify", () => ({
  sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a),
  sendWelcomeToUser: (...a: unknown[]) => sendWelcomeToUser(...a),
}));

const checkLoginAllowed = vi.fn();
const registerLoginFailure = vi.fn();
const clearLoginFailures = vi.fn();
vi.mock("@/lib/auth/login-throttle", () => ({
  MAX_FAILURES: 5,
  checkLoginAllowed: (...a: unknown[]) => checkLoginAllowed(...a),
  registerLoginFailure: (...a: unknown[]) => registerLoginFailure(...a),
  clearLoginFailures: (...a: unknown[]) => clearLoginFailures(...a),
}));

const hasTwoFactor = vi.fn();
const verifySecondFactor = vi.fn();
const openLoginChallenge = vi.fn();
vi.mock("@/lib/auth/two-factor", () => ({
  hasTwoFactor: (...a: unknown[]) => hasTwoFactor(...a),
  verifySecondFactor: (...a: unknown[]) => verifySecondFactor(...a),
  openLoginChallenge: (...a: unknown[]) => openLoginChallenge(...a),
}));

import { authOptions } from "@/lib/auth/nextauth";
import { decodeSession, encodeSession } from "@/lib/auth/session";
import type { RoleGrant } from "@/lib/auth/session";

const credentialsProvider = (authOptions.providers as any[]).find(
  (p) => (typeof p === "function" ? p() : p).id === "credentials" || (typeof p === "function" ? p() : p).type === "credentials",
);
// The Credentials provider is a plain config object in v5.
const authorize: (raw: Record<string, unknown>) => Promise<any> =
  (credentialsProvider as any)?.authorize ?? (authOptions.providers as any[])[0].authorize;

const GRANT: RoleGrant = { role: "FREELANCER", organizationId: "org_platform", locationIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  featureEnabled.mockResolvedValue(true);
  sendVerificationEmail.mockResolvedValue({ sent: true, delivered: true, transport: "mailbox" });
  sendWelcomeToUser.mockResolvedValue(undefined);
  hasTwoFactor.mockResolvedValue(false);
  checkLoginAllowed.mockResolvedValue({ allowed: true });
  registerLoginFailure.mockResolvedValue({ failures: 1, locked: false });
  membershipFindMany.mockResolvedValue([
    { role: "FREELANCER", tenantId: "org_platform", scopedBranches: [] },
  ]);
});

describe("two-step login", () => {
  const user = { id: "usr_1", email: "jan@example.nl", fullName: "Jan", passwordHash: "hash" };
  const challenge = "v1.challenge-token-sealed-xxxxxxxx";

  it("a correct password on a 2FA account asks for the code instead of logging in", async () => {
    userFindFirst.mockResolvedValue(user);
    bcryptCompare.mockResolvedValue(true);
    hasTwoFactor.mockResolvedValue(true);
    await expect(authorize({ email: "jan@example.nl", password: "hunter2" })).rejects.toMatchObject({ code: "2fa_required" });
    expect(recordAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.succeeded" }));
  });

  it("challenge + correct code logs in (no password needed again)", async () => {
    openLoginChallenge.mockReturnValue("jan@example.nl");
    userFindFirst.mockResolvedValue(user);
    verifySecondFactor.mockResolvedValue({ ok: true });
    const res = await authorize({ challenge, otp: "123456", remember: "1" });
    expect(res).toMatchObject({ id: "usr_1", remember: true });
    expect(bcryptCompare).not.toHaveBeenCalled();
    expect(clearLoginFailures).toHaveBeenCalledWith("jan@example.nl");
  });

  it("a wrong code is refused and counts towards the lockout", async () => {
    openLoginChallenge.mockReturnValue("jan@example.nl");
    userFindFirst.mockResolvedValue(user);
    verifySecondFactor.mockResolvedValue({ ok: false });
    await expect(authorize({ challenge, otp: "000000" })).rejects.toMatchObject({ code: "2fa_invalid" });
    expect(registerLoginFailure).toHaveBeenCalledWith("jan@example.nl");
  });

  it("an expired or forged challenge is refused", async () => {
    openLoginChallenge.mockReturnValue(null);
    expect(await authorize({ challenge, otp: "123456" })).toBeNull();
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("a locked-out account can't use the second step either", async () => {
    openLoginChallenge.mockReturnValue("jan@example.nl");
    checkLoginAllowed.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });
    await expect(authorize({ challenge, otp: "123456" })).rejects.toMatchObject({ code: "locked" });
    expect(verifySecondFactor).not.toHaveBeenCalled();
  });
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

    await expect(authorize(creds)).rejects.toMatchObject({ code: "locked" });
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
    const jwt = (await encode({ token: { sub: "usr_1", email: "a@b.nl", name: "A", roles: [GRANT], remember: true } } as any)) as string;

    const claims = await decodeSession(jwt);
    expect(claims).toMatchObject({ sub: "usr_1", email: "a@b.nl", name: "A", remember: true });
    expect(claims!.roles).toEqual([GRANT]);
  });

  it("encode returns an empty string when there is no subject (no anonymous cookie)", async () => {
    expect(await encode({ token: {} } as any)).toBe("");
  });

  it("decode round-trips a token produced by encodeSession", async () => {
    const jwt = await encodeSession({ sub: "usr_9", email: "x@y.nl", name: "X", roles: [GRANT] });
    const out = (await decode({ token: jwt } as any)) as any;
    expect(out).toMatchObject({ sub: "usr_9", email: "x@y.nl", name: "X", roles: [GRANT] });
  });

  it("decode rejects a garbage / forged token", async () => {
    expect(await decode({ token: "not.a.jwt" } as any)).toBeNull();
  });
});

describe("callbacks.jwt / callbacks.session — role propagation", () => {
  it("jwt copies the credentials roles onto the token on first sign-in", async () => {
    const cb = authOptions.callbacks!.jwt!;
    const token = await cb({
      token: {},
      user: { id: "usr_1", email: "a@b.nl", name: "A", roles: [GRANT], remember: true } as any,
    } as any);
    expect(token).toMatchObject({ sub: "usr_1", roles: [GRANT], remember: true });
  });

  it("jwt reloads grants from the DB on an explicit session update", async () => {
    membershipFindMany.mockResolvedValue([
      { role: "HQ_ADMIN", tenantId: "org_a", scopedBranches: [{ branchId: "b1" }] },
    ]);
    const cb = authOptions.callbacks!.jwt!;
    const token = await cb({ token: { sub: "usr_1" }, trigger: "update" } as any);
    expect((token as any).roles).toEqual([
      { role: "HQ_ADMIN", organizationId: "org_a", locationIds: ["b1"] },
    ]);
  });

  it("session exposes id + roles from the token to the app", async () => {
    const cb = authOptions.callbacks!.session!;
    const session = await cb({
      session: { user: {} } as any,
      token: { sub: "usr_1", roles: [GRANT] } as any,
    } as any);
    expect((session as any).user).toMatchObject({ id: "usr_1", roles: [GRANT] });
  });
});

describe("callbacks.signIn — Google gate", () => {
  const signIn = () => authOptions.callbacks!.signIn!;

  it("lets a plain credentials sign-in through untouched", async () => {
    expect(await signIn()({ account: { provider: "credentials" } } as any)).toBe(true);
  });

  it("blocks a Google identity whose e-mail Google itself marks unverified", async () => {
    const res = await signIn()({
      account: { provider: "google" } as any,
      profile: { email: "spoof@gmail.com", email_verified: false } as any,
      user: {} as any,
    } as any);
    expect(res).toBe(false);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("accepts a verified Google e-mail that maps to an existing enabled account", async () => {
    userFindFirst.mockResolvedValue({ id: "usr_1", fullName: "Jan", email: "jan@example.nl" });
    userUpdate.mockResolvedValue({});
    const res = await signIn()({
      account: { provider: "google" } as any,
      profile: { email: "jan@example.nl", email_verified: true, name: "Jan" } as any,
      user: {} as any,
    } as any);
    expect(res).toBe(true);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.succeeded" }));
    expect(userCreate).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(sendWelcomeToUser).not.toHaveBeenCalled();
  });

  describe("eerste Google-login met een onbekend adres", () => {
    const nieuw = () =>
      signIn()({
        account: { provider: "google" } as any,
        profile: { email: "Nieuw@Example.nl", email_verified: true, name: "Nina" } as any,
        user: {} as any,
      } as any);
    beforeEach(() => {
      // eerst onbekend, na het aanmaken gevonden
      userFindFirst.mockReset();
      userFindFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: "usr_new", fullName: "Nina", email: "nieuw@example.nl" });
      userCreate.mockResolvedValue({ id: "usr_new" });
      userUpdate.mockResolvedValue({});
    });

    it("vlag aan: account niet bevestigd en verificatiemail verstuurd", async () => {
      expect(await nieuw()).toBe(true);
      const data = userCreate.mock.calls[0]![0].data;
      expect(data.email).toBe("nieuw@example.nl");
      expect(data).not.toHaveProperty("emailVerifiedAt");
      expect(sendVerificationEmail).toHaveBeenCalledWith("usr_new", "nieuw@example.nl", "Nina");
      expect(sendWelcomeToUser).not.toHaveBeenCalled();
      expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.register.oauth" }));
    });

    it("vlag uit: meteen bevestigd en een welkomstmail, geen codemail", async () => {
      featureEnabled.mockResolvedValue(false);
      expect(await nieuw()).toBe(true);
      expect(userCreate.mock.calls[0]![0].data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(sendWelcomeToUser).toHaveBeenCalledWith("usr_new");
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("een mislukte mail blokkeert het inloggen niet", async () => {
      sendVerificationEmail.mockRejectedValue(new Error("smtp weg"));
      expect(await nieuw()).toBe(true);
    });
  });
});

describe("callbacks.signIn — Apple", () => {
  const signIn = () => authOptions.callbacks!.signIn!;
  const apple = (profile: Record<string, unknown>, user: Record<string, unknown> = {}) =>
    signIn()({ account: { provider: "apple" } as any, profile: { sub: "001234.abc", ...profile } as any, user: user as any } as any);

  it("koppelt op e-mail aan een bestaand account (email_verified als tekst)", async () => {
    userFindFirst.mockResolvedValue({ id: "usr_1", fullName: "Jan", email: "jan@icloud.com" });
    userUpdate.mockResolvedValue({});
    expect(await apple({ email: "Jan@iCloud.com", email_verified: "true" })).toBe(true);
    expect(userFindFirst.mock.calls[0]![0].where.email).toBe("jan@icloud.com");
    expect(userCreate).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.login.succeeded", summary: "Inloggen geslaagd via Apple: jan@icloud.com", metadata: { provider: "apple", provisioned: false } }),
    );
  });

  it("weigert een adres dat Apple zelf onbevestigd noemt, en een aanmelding zonder adres", async () => {
    expect(await apple({ email: "x@icloud.com", email_verified: "false" })).toBe("/login?error=AppleLogin");
    expect(await apple({ email_verified: "true" })).toBe("/login?error=AppleLogin");
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  describe("nieuw account", () => {
    beforeEach(() => {
      userFindFirst.mockReset();
      userFindFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: "usr_new", fullName: "x", email: "x" });
      userCreate.mockResolvedValue({ id: "usr_new" });
      userUpdate.mockResolvedValue({});
    });

    it("de eerste keer: de naam van Apple en dezelfde bevestigingsmail als bij Google", async () => {
      const res = await apple({ email: "nina@icloud.com", email_verified: true, user: { name: { firstName: "Nina", lastName: "de Vries" } } });
      expect(res).toBe(true);
      const data = userCreate.mock.calls[0]![0].data;
      expect(data).toMatchObject({ email: "nina@icloud.com", fullName: "Nina de Vries", memberships: { create: { role: "FREELANCER" } } });
      expect(data).not.toHaveProperty("emailVerifiedAt");
      expect(sendVerificationEmail).toHaveBeenCalledWith("usr_new", "nina@icloud.com", "Nina de Vries");
      expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.register.oauth", metadata: { provider: "apple", provisioned: true } }));
    });

    it("een privé-adres van Apple is een eigen adres: meteen bevestigd, geen code die kan blijven hangen", async () => {
      const res = await apple({ email: "x7k2abc@privaterelay.appleid.com", email_verified: "true" }, { name: null });
      expect(res).toBe(true);
      const data = userCreate.mock.calls[0]![0].data;
      expect(data.email).toBe("x7k2abc@privaterelay.appleid.com");
      expect(data.fullName).toBe("Nieuwe gebruiker");
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(sendVerificationEmail).not.toHaveBeenCalled();
      expect(sendWelcomeToUser).toHaveBeenCalledWith("usr_new");
    });
  });
});

describe("Apple-provider", () => {
  const SLEUTELS = ["APPLE_SIWA_SERVICES_ID", "APPLE_TEAM_ID", "APPLE_SIWA_KEY_ID", "APPLE_SIWA_KEY_P8"] as const;
  const isApple = (p: any) => (typeof p === "function" ? p() : p).id === "apple";

  it("zonder config is Apple uit en blijven de andere aanbieders gelijk", () => {
    expect((authOptions.providers as any[]).some(isApple)).toBe(false);
    expect((authOptions.providers as any[]).some((p) => (typeof p === "function" ? p() : p).id === "credentials")).toBe(true);
  });

  it("met config: aan, met een vers geheim en een naam die nooit het e-mailadres is", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const pem = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const oud = Object.fromEntries(SLEUTELS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { APPLE_SIWA_SERVICES_ID: "com.zekerflex.web", APPLE_TEAM_ID: "SZ985SQP65", APPLE_SIWA_KEY_ID: "KEY1234567", APPLE_SIWA_KEY_P8: pem });
    try {
      vi.resetModules();
      const { authOptions: metApple } = await import("@/lib/auth/nextauth");
      const provider = (metApple.providers as any[]).find(isApple);
      expect(provider).toBeTruthy();
      const opties = provider.options;
      expect(opties.clientId).toBe("com.zekerflex.web");
      const inhoud = JSON.parse(Buffer.from(String(opties.clientSecret).split(".")[1]!, "base64url").toString());
      expect(inhoud).toMatchObject({ iss: "SZ985SQP65", sub: "com.zekerflex.web", aud: "https://appleid.apple.com" });
      expect(opties.profile({ sub: "001.abc", email: "x@privaterelay.appleid.com" })).toEqual({ id: "001.abc", name: null, email: "x@privaterelay.appleid.com", image: null });
      expect(opties.profile({ sub: "001.abc", email: "n@icloud.com", user: { name: { firstName: "Nina", lastName: "Bos" } } }).name).toBe("Nina Bos");
    } finally {
      for (const k of SLEUTELS) {
        if (oud[k] === undefined) delete process.env[k];
        else process.env[k] = oud[k];
      }
    }
  });
});
