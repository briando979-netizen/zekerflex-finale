import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// De passkey-provider in lib/auth/nextauth.ts: dezelfde gebruiker met rollen als
// het wachtwoord-inloggen, een geweigerde inlog geeft zijn code door, en de
// signIn-callback laat een (in authorize gecontroleerde) passkey-inlog door.
// next-auth zelf is vervangen door dunne doorgeefluiken, zoals in
// tests/auth-signin.test.ts.
// ---------------------------------------------------------------------------

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

const membershipFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) }, user: {} },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/metrics", () => ({ recordLoginFailure: vi.fn() }));
vi.mock("@/lib/auth/login-throttle", () => ({ MAX_FAILURES: 5, checkLoginAllowed: vi.fn(), registerLoginFailure: vi.fn(), clearLoginFailures: vi.fn() }));
vi.mock("@/lib/auth/two-factor", () => ({ hasTwoFactor: vi.fn(), verifySecondFactor: vi.fn(), openLoginChallenge: vi.fn() }));

const authorizePasskey = vi.fn();
vi.mock("@/lib/auth/passkey/inloggen", () => ({ authorizePasskey: (...a: unknown[]) => authorizePasskey(...a) }));

import { authOptions } from "@/lib/auth/nextauth";

type Provider = { id: string; type: string; authorize: (raw: unknown, req: Request) => Promise<unknown> };
const providers = authOptions.providers as unknown as Provider[];
const passkey = providers.find((p) => p.id === "passkey")!;
const req = new Request("http://app:3000/api/auth/callback/passkey", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  membershipFindMany.mockResolvedValue([{ role: "FREELANCER", tenantId: "org_platform", scopedBranches: [] }]);
});

describe("passkey-provider", () => {
  it("bestaat naast de wachtwoord-provider, die als eerste blijft staan", () => {
    expect(passkey).toBeTruthy();
    expect(providers[0]?.id).toBe("credentials");
  });

  it("een geslaagde passkey-inlog geeft dezelfde gebruiker met rollen als het wachtwoord", async () => {
    authorizePasskey.mockResolvedValue({ ok: true, user: { id: "usr_1", email: "jan@example.test", name: "Jan", remember: true } });
    await expect(passkey.authorize({ response: "{}" }, req)).resolves.toEqual({
      id: "usr_1",
      email: "jan@example.test",
      name: "Jan",
      remember: true,
      roles: [{ role: "FREELANCER", organizationId: "org_platform", locationIds: [] }],
    });
    expect(authorizePasskey).toHaveBeenCalledWith({ response: "{}" }, req);
  });

  it("een geweigerde passkey-inlog geeft de code door aan het inlogscherm", async () => {
    authorizePasskey.mockResolvedValue({ ok: false, code: "passkey_uv" });
    await expect(passkey.authorize({ response: "{}" }, req)).rejects.toMatchObject({ code: "passkey_uv" });
    expect(membershipFindMany).not.toHaveBeenCalled();
  });

  it("callbacks.signIn laat een passkey-inlog door (al gecontroleerd in authorize)", async () => {
    const signIn = authOptions.callbacks!.signIn! as unknown as (p: { account: { provider: string }; user: object }) => Promise<unknown>;
    await expect(signIn({ account: { provider: "passkey" }, user: {} })).resolves.toBe(true);
    await expect(signIn({ account: { provider: "iets-anders" }, user: {} })).resolves.toBe(false);
  });
});
