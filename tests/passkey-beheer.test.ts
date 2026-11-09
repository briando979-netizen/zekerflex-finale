import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nieuwToestel, registratieJson, registreer, type Toestel } from "@/tests/helpers/webauthn-toestel";

// ---------------------------------------------------------------------------
// Passkeys beheren (lib/auth/passkey/beheer.ts): toevoegen vraagt opnieuw
// bevestigen (wachtwoord, en de 2FA-code als die aan staat), de challenge is
// eenmalig en hoort bij de gebruiker, en toevoegen/verwijderen komt in de audit.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  state: {
    redis: new Map<string, string>(),
    user: null as null | Record<string, unknown>,
    passkeys: [] as Record<string, unknown>[],
    created: [] as Record<string, unknown>[],
    deleted: [] as unknown[],
    audits: [] as Record<string, unknown>[],
    tweestaps: false,
    codeOk: true,
    wachtwoordOk: true,
    bestaatAl: false,
  },
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.com", NODE_ENV: "test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    set: async (k: string, v: string) => void h.state.redis.set(k, v),
    getdel: async (k: string) => {
      const v = h.state.redis.get(k) ?? null;
      h.state.redis.delete(k);
      return v;
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: async () => ({ ok: true }) }));
vi.mock("bcryptjs", () => ({ default: { compare: async () => h.state.wachtwoordOk } }));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void h.state.audits.push(a) }));
vi.mock("@/lib/auth/two-factor", () => ({
  hasTwoFactor: async () => h.state.tweestaps,
  verifySecondFactor: async () => ({ ok: h.state.codeOk }),
}));
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(m: string, o: { code: string }) {
      super(m);
      this.code = o.code;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});
vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    prisma: {
      user: {
        findFirst: async ({ select }: { select: Record<string, unknown> }) => {
          if (!h.state.user) return null;
          return { ...h.state.user, passkeys: h.state.passkeys, ...(select._count ? { _count: { passkeys: h.state.passkeys.length } } : {}) };
        },
        findUnique: async () => h.state.user,
      },
      passkey: {
        findMany: async () => h.state.passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: null, backedUp: false })),
        findFirst: async ({ where }: { where: { id: string; userId: string } }) => h.state.passkeys.find((p) => p.id === where.id && p.userId === where.userId) ?? null,
        deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
          h.state.deleted.push(where);
          h.state.passkeys = h.state.passkeys.filter((p) => !(p.id === where.id && p.userId === where.userId));
          return { count: 1 };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (h.state.bestaatAl) throw new (Prisma as unknown as { PrismaClientKnownRequestError: new (m: string, o: { code: string }) => Error }).PrismaClientKnownRequestError("uniek", { code: "P2002" });
          h.state.created.push(data);
          h.state.passkeys.push({ id: `pk_${h.state.created.length}`, userId: data.userId, name: data.name, createdAt: new Date("2026-11-09T15:00:00+01:00"), ...data });
          return { id: `pk_${h.state.created.length}` };
        },
      },
    },
  };
});

import { beginRegistratie, verwijderPasskey, voltooiRegistratie } from "@/lib/auth/passkey/beheer";

const ORIGIN = "https://zekerflex.com";
let toestel: Toestel;

beforeEach(() => {
  h.state.redis.clear();
  h.state.user = { id: "usr_1", email: "jan@example.test", fullName: "Jan", passwordHash: "hash", emailVerifiedAt: new Date("2026-10-01T10:00:00+02:00") };
  h.state.passkeys = [];
  h.state.created.length = 0;
  h.state.deleted.length = 0;
  h.state.audits.length = 0;
  h.state.tweestaps = false;
  h.state.codeOk = true;
  h.state.wachtwoordOk = true;
  h.state.bestaatAl = false;
  toestel = nieuwToestel();
});
afterEach(() => vi.clearAllMocks());

async function voegToe(origin = ORIGIN) {
  const opties = await beginRegistratie("usr_1", { wachtwoord: "geheim" });
  toestel.userHandle = Buffer.from(opties.user.id, "base64url");
  const r = registreer(toestel, { rpId: opties.rp.id, origin, challenge: opties.challenge });
  return { opties, credential: registratieJson(r) };
}

describe("passkey toevoegen", () => {
  it("geeft opties voor zekerflex.com met een willekeurige user handle (geen e-mail of id)", async () => {
    const opties = await beginRegistratie("usr_1", { wachtwoord: "geheim" });
    expect(opties).toMatchObject({
      rp: { id: "zekerflex.com", name: "ZekerFlex" },
      user: { name: "jan@example.test", displayName: "Jan" },
      attestation: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      timeout: 300_000,
    });
    expect(Buffer.from(opties.user.id, "base64url")).toHaveLength(32);
    expect(opties.user.id).not.toContain("usr_1");
    expect(opties.pubKeyCredParams.map((p) => p.alg)).toEqual([-7, -8, -257]);
  });

  it("vraagt het wachtwoord opnieuw", async () => {
    await expect(beginRegistratie("usr_1", {})).rejects.toMatchObject({ code: "WACHTWOORD_ONJUIST", status: 400 });
    h.state.wachtwoordOk = false;
    await expect(beginRegistratie("usr_1", { wachtwoord: "fout" })).rejects.toMatchObject({ code: "WACHTWOORD_ONJUIST" });
    expect(h.state.redis.size).toBe(0);
  });

  it("vraagt bij tweestapsverificatie ook de code (een gestolen sessie kan 2FA zo niet omzeilen)", async () => {
    h.state.tweestaps = true;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim" })).rejects.toMatchObject({ code: "CODE_ONJUIST" });
    h.state.codeOk = false;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim", code: "123456" })).rejects.toMatchObject({ code: "CODE_ONJUIST" });
    h.state.codeOk = true;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim", code: "123456" })).resolves.toMatchObject({ rp: { id: "zekerflex.com" } });
  });

  it("een account zonder wachtwoord (alleen Google) en zonder 2FA: de sessie volstaat", async () => {
    h.state.user = { ...h.state.user, passwordHash: null };
    await expect(beginRegistratie("usr_1", {})).resolves.toMatchObject({ rp: { id: "zekerflex.com" } });
  });

  it("e-mail nog niet bevestigd: 423 met eigen code", async () => {
    h.state.user = { ...h.state.user, emailVerifiedAt: null };
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim" })).rejects.toMatchObject({ code: "EMAIL_ONBEVESTIGD", status: 423 });
  });

  it("bewaart een geldige passkey met audit, zonder onbekende transports", async () => {
    const { credential } = await voegToe();
    const lijst = await voltooiRegistratie("usr_1", { naam: "  Mijn  iPhone ", credential });
    expect(lijst).toHaveLength(1);
    expect(h.state.created[0]).toMatchObject({
      userId: "usr_1",
      credentialId: toestel.credentialId.toString("base64url"),
      algorithm: -7,
      signCount: 0n,
      userHandle: toestel.userHandle.toString("base64url"),
      transports: ["internal", "hybrid"],
      name: "Mijn iPhone",
    });
    expect((h.state.created[0]?.publicKey as Buffer).equals(toestel.cose)).toBe(true);
    expect(h.state.audits.at(-1)).toMatchObject({ category: "SECURITY", action: "auth.passkey.added", actorUserId: "usr_1" });
  });

  it("een tweede passkey krijgt dezelfde user handle", async () => {
    const eerste = await voegToe();
    await voltooiRegistratie("usr_1", { naam: "iPhone", credential: eerste.credential });
    const opties = await beginRegistratie("usr_1", { wachtwoord: "geheim" });
    expect(opties.user.id).toBe(eerste.opties.user.id);
    expect(opties.excludeCredentials.map((c) => c.id)).toEqual([toestel.credentialId.toString("base64url")]);
  });

  it("de challenge is eenmalig: nog een keer afronden gaat niet", async () => {
    const { credential } = await voegToe();
    await voltooiRegistratie("usr_1", { naam: "iPhone", credential });
    await expect(voltooiRegistratie("usr_1", { naam: "iPhone", credential })).rejects.toMatchObject({ code: "PASSKEY_VERLOPEN" });
  });

  it("de challenge hoort bij de gebruiker: een ander kan hem niet afronden", async () => {
    const { credential } = await voegToe();
    await expect(voltooiRegistratie("usr_2", { naam: "iPhone", credential })).rejects.toMatchObject({ code: "PASSKEY_VERLOPEN" });
  });

  it("een vervalste origin wordt geweigerd en verbruikt de challenge", async () => {
    const { credential } = await voegToe("https://zekerflex.com.evil.example");
    await expect(voltooiRegistratie("usr_1", { naam: "iPhone", credential })).rejects.toMatchObject({ code: "PASSKEY_GEWEIGERD", status: 400 });
    expect(h.state.redis.size).toBe(0);
    expect(h.state.created).toHaveLength(0);
  });

  it("een passkey die al bij iemand hoort (uniek credential-id): 409", async () => {
    const { credential } = await voegToe();
    h.state.bestaatAl = true;
    await expect(voltooiRegistratie("usr_1", { naam: "iPhone", credential })).rejects.toMatchObject({ code: "PASSKEY_BESTAAT", status: 409 });
  });
});

describe("passkey verwijderen", () => {
  beforeEach(() => {
    h.state.passkeys = [{ id: "pk_9", userId: "usr_1", name: "iPhone", createdAt: new Date("2026-11-01T10:00:00+01:00") }];
  });

  it("alleen je eigen passkey; die van een ander vindt niets (404, geen 403)", async () => {
    await expect(verwijderPasskey("usr_2", "pk_9")).rejects.toMatchObject({ code: "PASSKEY_ONBEKEND", status: 404 });
    expect(h.state.deleted).toHaveLength(0);
  });

  it("verwijdert en schrijft de audit", async () => {
    expect(await verwijderPasskey("usr_1", "pk_9")).toEqual([]);
    expect(h.state.deleted[0]).toEqual({ id: "pk_9", userId: "usr_1" });
    expect(h.state.audits.at(-1)).toMatchObject({ category: "SECURITY", action: "auth.passkey.removed", severity: "warning" });
  });
});
