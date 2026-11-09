import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nieuwToestel, registratieJson, registreer, type Toestel } from "@/tests/helpers/webauthn-toestel";

// ---------------------------------------------------------------------------
// Passkeys beheren (lib/auth/passkey/beheer.ts): toevoegen vraagt NOOIT alleen
// een sessie (wachtwoord, of zonder wachtwoord een code per mail, plus de
// 2FA-code als die aan staat), de challenge is eenmalig en hoort bij de
// gebruiker, en toevoegen/verwijderen komt in de audit en in een mail.
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
    kv: new Map<string, unknown>(),
    mails: [] as { to: string; subject: string; text: string; kind?: string }[],
    mailOk: true,
    mailGooit: false,
    redisStoring: false,
    locked: false,
    failures: [] as string[],
    bcryptAanroepen: 0,
    limieten: [] as { key: string; opts: unknown }[],
  },
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.com", NODE_ENV: "test", AUTH_SECRET: "test-geheim-test-geheim-test-geheim" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    set: async (k: string, v: string) => {
      if (h.state.redisStoring) throw new Error("Redis weg");
      h.state.redis.set(k, v);
    },
    del: async (k: string) => void h.state.redis.delete(k),
    getdel: async (k: string) => {
      const v = h.state.redis.get(k) ?? null;
      h.state.redis.delete(k);
      return v;
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  fixedWindow: async (key: string, _max: number, _sec: number, opts?: unknown) => {
    h.state.limieten.push({ key, opts });
    return { ok: true };
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: async () => {
      h.state.bcryptAanroepen++;
      return h.state.wachtwoordOk;
    },
  },
}));
vi.mock("@/lib/auth/login-throttle", () => ({
  checkLoginAllowed: async () => ({ allowed: !h.state.locked, retryAfterSeconds: h.state.locked ? 900 : 0 }),
  registerLoginFailure: async (email: string) => {
    h.state.failures.push(email);
    return { failures: h.state.failures.length, locked: false };
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.state.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.state.kv.set(k, v),
  kvDelete: async (k: string) => void h.state.kv.delete(k),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; text: string; kind?: string }) => {
    if (h.state.mailGooit) throw new Error("SMTP weg");
    h.state.mails.push(m);
    return { delivered: h.state.mailOk };
  },
}));
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
        findUnique: async () => (h.state.user ? { ...h.state.user, passkeys: h.state.passkeys } : null),
      },
      passkey: {
        findMany: async () => h.state.passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: null, backedUp: false })),
        findFirst: async ({ where }: { where: { id: string; userId: string } }) => h.state.passkeys.find((p) => p.id === where.id && p.userId === where.userId) ?? null,
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          h.state.deleted.push(where);
          const past = (p: Record<string, unknown>) => Object.entries(where).every(([k, v]) => p[k] === v);
          const voor = h.state.passkeys.length;
          h.state.passkeys = h.state.passkeys.filter((p) => !past(p));
          return { count: voor - h.state.passkeys.length };
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

import { beginRegistratie, meldPasskeysNaTweestaps, verwijderPasskey, voltooiRegistratie, wisPasskeysNaHerstel } from "@/lib/auth/passkey/beheer";

const ORIGIN = "https://zekerflex.com";
let toestel: Toestel;

beforeEach(() => {
  h.state.redis.clear();
  h.state.user = {
    id: "usr_1",
    email: "jan@example.test",
    fullName: "Jan de Vries",
    passwordHash: "hash",
    emailVerifiedAt: new Date("2026-10-01T10:00:00+02:00"),
    memberships: [{ role: "FREELANCER" }],
  };
  h.state.passkeys = [];
  h.state.created.length = 0;
  h.state.deleted.length = 0;
  h.state.audits.length = 0;
  h.state.tweestaps = false;
  h.state.codeOk = true;
  h.state.wachtwoordOk = true;
  h.state.bestaatAl = false;
  h.state.kv.clear();
  h.state.mails.length = 0;
  h.state.mailOk = true;
  h.state.mailGooit = false;
  h.state.redisStoring = false;
  h.state.locked = false;
  h.state.failures.length = 0;
  h.state.bcryptAanroepen = 0;
  h.state.limieten.length = 0;
  toestel = nieuwToestel();
});

const NU = Date.parse("2026-11-09T15:04:00+01:00");

/** De 6-cijferige code uit de laatste mail. */
function codeUitMail(): string {
  return h.state.mails.at(-1)?.text.match(/\n(\d{6})\n/)?.[1] ?? "";
}

/** Zonder wachtwoord: eerst de code laten mailen (dat weigert met PASSKEY_MAILCODE_GESTUURD). */
async function vraagMailcode(now = NU): Promise<string> {
  await expect(beginRegistratie("usr_1", {}, now)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_GESTUURD", status: 423 });
  return codeUitMail();
}
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
      user: { name: "jan@example.test", displayName: "Jan de Vries" },
      attestation: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
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
    expect(h.state.redis.size).toBe(0); // de alvast bewaarde challenge is weer weg
  });

  it("een fout wachtwoord telt mee in het inlogslot en komt in de audit", async () => {
    h.state.wachtwoordOk = false;
    await expect(beginRegistratie("usr_1", { wachtwoord: "fout" })).rejects.toMatchObject({ code: "WACHTWOORD_ONJUIST" });
    expect(h.state.failures).toEqual(["jan@example.test"]);
    expect(h.state.audits.at(-1)).toMatchObject({ category: "SECURITY", action: "auth.passkey.reconfirm_failed", metadata: { via: "wachtwoord" } });
  });

  it("een geblokkeerd account (inlogslot) mag geen passkey toevoegen; het wachtwoord wordt dan niet eens gecontroleerd", async () => {
    h.state.locked = true;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim" })).rejects.toMatchObject({ code: "INLOG_GEBLOKKEERD", status: 423 });
    expect(h.state.bcryptAanroepen).toBe(0);
  });

  it("Redis weg: 503 vóór de herbevestiging, dus het antwoord verraadt niet of het wachtwoord klopte", async () => {
    h.state.redisStoring = true;
    h.state.wachtwoordOk = false;
    await expect(beginRegistratie("usr_1", { wachtwoord: "fout" })).rejects.toMatchObject({ code: "PASSKEY_STORING", status: 503 });
    h.state.wachtwoordOk = true;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim" })).rejects.toMatchObject({ code: "PASSKEY_STORING", status: 503 });
    expect(h.state.bcryptAanroepen).toBe(0);
    expect(h.state.failures).toHaveLength(0);
  });

  it("de aanvraaglimiet faalt dicht bij een Redis-storing", async () => {
    await beginRegistratie("usr_1", { wachtwoord: "geheim" });
    expect(h.state.limieten.find((l) => l.key === "rl:passkey-registreren:usr_1")?.opts).toEqual({ failOpen: false });
  });

  it("een toestel dat niet met vingerafdruk, gezicht of pincode bevestigt (geen UV) wordt geweigerd", async () => {
    const opties = await beginRegistratie("usr_1", { wachtwoord: "geheim" });
    toestel.userHandle = Buffer.from(opties.user.id, "base64url");
    const r = registreer(toestel, { rpId: opties.rp.id, origin: ORIGIN, challenge: opties.challenge, vlaggen: { uv: false } });
    await expect(voltooiRegistratie("usr_1", { naam: "Sleutel", credential: registratieJson(r) })).rejects.toMatchObject({ code: "PASSKEY_GEWEIGERD" });
    expect(h.state.created).toHaveLength(0);
  });

  it("vraagt bij tweestapsverificatie ook de code (een gestolen sessie kan 2FA zo niet omzeilen)", async () => {
    h.state.tweestaps = true;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim" })).rejects.toMatchObject({ code: "CODE_ONJUIST" });
    h.state.codeOk = false;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim", code: "123456" })).rejects.toMatchObject({ code: "CODE_ONJUIST" });
    h.state.codeOk = true;
    await expect(beginRegistratie("usr_1", { wachtwoord: "geheim", code: "123456" })).resolves.toMatchObject({ rp: { id: "zekerflex.com" } });
  });

  describe("account zonder wachtwoord (alleen Google): code per mail", () => {
    beforeEach(() => {
      h.state.user = { ...h.state.user, passwordHash: null };
    });

    it("zonder mailcode geweigerd: alleen de sessie is nooit genoeg (er gaat een code naar het bekende adres)", async () => {
      await expect(beginRegistratie("usr_1", {}, NU)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_GESTUURD", status: 423 });
      expect(h.state.redis.size).toBe(0); // geen challenge, dus geen passkey
      expect(h.state.mails).toHaveLength(1);
      expect(h.state.mails[0]).toMatchObject({ to: "jan@example.test", kind: "passkey-code" });
      expect(codeUitMail()).toMatch(/^\d{6}$/);
      // ook een wachtwoord-veld helpt niet: het account heeft er geen
      await expect(beginRegistratie("usr_1", { wachtwoord: "iets" }, NU)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_GESTUURD" });
    });

    it("met de juiste mailcode: wel opties", async () => {
      const code = await vraagMailcode();
      await expect(beginRegistratie("usr_1", { mailcode: code }, NU + 60_000)).resolves.toMatchObject({ rp: { id: "zekerflex.com" } });
      expect(h.state.redis.size).toBe(1);
    });

    it("een verkeerde code wordt geweigerd, telt mee in het inlogslot en komt in de audit", async () => {
      const code = await vraagMailcode();
      const fout = code === "000000" ? "111111" : "000000";
      await expect(beginRegistratie("usr_1", { mailcode: fout }, NU + 1000)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_ONGELDIG", status: 423 });
      expect(h.state.redis.size).toBe(0);
      expect(h.state.failures).toEqual(["jan@example.test"]);
      expect(h.state.audits.at(-1)).toMatchObject({ action: "auth.passkey.reconfirm_failed", metadata: { via: "mail" } });
    });

    it("een verlopen code (na 15 minuten) wordt geweigerd", async () => {
      const code = await vraagMailcode();
      await expect(beginRegistratie("usr_1", { mailcode: code }, NU + 16 * 60_000)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_VERLOPEN" });
    });

    it("een hergebruikte code wordt geweigerd (eenmalig)", async () => {
      const code = await vraagMailcode();
      await beginRegistratie("usr_1", { mailcode: code }, NU + 1000);
      await expect(beginRegistratie("usr_1", { mailcode: code }, NU + 2000)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_VERLOPEN" });
    });

    it("na 5 foute pogingen telt ook de goede code niet meer", async () => {
      const code = await vraagMailcode();
      const fout = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        await expect(beginRegistratie("usr_1", { mailcode: fout }, NU + 1000)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_ONGELDIG" });
      }
      await expect(beginRegistratie("usr_1", { mailcode: code }, NU + 2000)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_VERLOPEN" });
    });

    it("de code van een ander account werkt niet", async () => {
      const code = await vraagMailcode();
      h.state.user = { ...h.state.user, id: "usr_2" };
      await expect(beginRegistratie("usr_2", { mailcode: code }, NU + 1000)).rejects.toMatchObject({ code: "PASSKEY_MAILCODE_VERLOPEN" });
    });

    it("bewaart alleen een HMAC van de code, onder een wisbare AVG-sleutel", async () => {
      const code = await vraagMailcode();
      expect([...h.state.kv.keys()]).toEqual(["passkey-toevoegen:usr_1"]);
      expect(JSON.stringify([...h.state.kv.values()])).not.toContain(code);
      const { ERASABLE_KV_PREFIXES } = await import("@/lib/privacy/user-kv");
      expect(ERASABLE_KV_PREFIXES).toContain("passkey-toevoegen:");
    });

    it("mail niet bezorgd: 503 en geen code bewaard", async () => {
      h.state.mailOk = false;
      await expect(beginRegistratie("usr_1", {}, NU)).rejects.toMatchObject({ code: "PASSKEY_MAIL_MISLUKT", status: 503 });
      expect(h.state.kv.size).toBe(0);
    });

    it("met 2FA: mailcode én de code uit de app", async () => {
      h.state.tweestaps = true;
      const code = await vraagMailcode();
      await expect(beginRegistratie("usr_1", { mailcode: code }, NU + 1000)).rejects.toMatchObject({ code: "CODE_ONJUIST" });
      await expect(beginRegistratie("usr_1", { mailcode: code, code: "123456" }, NU + 2000)).resolves.toMatchObject({ rp: { id: "zekerflex.com" } });
    });
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

  it("stuurt een melding naar het bekende adres met toestelnaam, Nederlandse tijd en de link naar de werkerpagina", async () => {
    const { credential } = await voegToe();
    h.state.mails.length = 0;
    await voltooiRegistratie("usr_1", { naam: "iPhone van Jan", credential }, new Date("2026-11-09T14:04:00Z"));
    expect(h.state.mails).toHaveLength(1);
    const m = h.state.mails[0]!;
    expect(m).toMatchObject({ to: "jan@example.test", kind: "passkey-toegevoegd", subject: "Er is een passkey toegevoegd aan je account" });
    expect(m.text).toContain("Hoi Jan,");
    expect(m.text).toContain("iPhone van Jan");
    expect(m.text).toContain("9 november 2026 om 15:04"); // 14:04 UTC = 15:04 in Amsterdam
    expect(m.text).toContain("Was jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord");
    expect(m.text).toContain("https://zekerflex.com/dashboard/account/passkeys");
  });

  it("een mislukte melding laat het toevoegen niet mislukken", async () => {
    const { credential } = await voegToe();
    h.state.mailGooit = true;
    await expect(voltooiRegistratie("usr_1", { naam: "iPhone", credential })).resolves.toHaveLength(1);
    expect(h.state.created).toHaveLength(1);
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

  it("stuurt een melding; een opdrachtgever krijgt de link naar de werkgeverspagina", async () => {
    h.state.user = { ...h.state.user, memberships: [{ role: "HQ_ADMIN" }] };
    await verwijderPasskey("usr_1", "pk_9", new Date("2026-07-01T08:30:00Z"));
    expect(h.state.mails).toHaveLength(1);
    const m = h.state.mails[0]!;
    expect(m).toMatchObject({ to: "jan@example.test", kind: "passkey-verwijderd", subject: "Er is een passkey verwijderd uit je account" });
    expect(m.text).toContain("iPhone");
    expect(m.text).toContain("1 juli 2026 om 10:30"); // zomertijd: UTC+2
    expect(m.text).toContain("Was jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord");
    expect(m.text).toContain("https://zekerflex.com/werkgever/account");
  });

  it("een mislukte melding laat het verwijderen niet mislukken", async () => {
    h.state.mailGooit = true;
    await expect(verwijderPasskey("usr_1", "pk_9")).resolves.toEqual([]);
    expect(h.state.deleted).toHaveLength(1);
  });
});

describe("na een wachtwoordherstel", () => {
  beforeEach(() => {
    h.state.passkeys = [
      { id: "pk_1", userId: "usr_1", name: "iPhone", createdAt: new Date("2026-11-01T10:00:00+01:00") },
      { id: "pk_2", userId: "usr_1", name: "Windows", createdAt: new Date("2026-11-02T10:00:00+01:00") },
      { id: "pk_3", userId: "usr_9", name: "Van een ander", createdAt: new Date("2026-11-02T10:00:00+01:00") },
    ];
  });

  it("verwijdert alle passkeys van die gebruiker (niet die van een ander), met audit en mail", async () => {
    expect(await wisPasskeysNaHerstel("usr_1", new Date("2026-11-09T14:04:00Z"))).toBe(2);
    expect(h.state.passkeys.map((p) => p.id)).toEqual(["pk_3"]);
    expect(h.state.audits.at(-1)).toMatchObject({ category: "SECURITY", action: "auth.passkey.removed_on_reset", metadata: { aantal: 2 } });
    expect(h.state.mails).toHaveLength(1);
    const m = h.state.mails[0]!;
    expect(m).toMatchObject({ to: "jan@example.test", kind: "passkey-herstel" });
    expect(m.text).toContain("iPhone, Windows");
    expect(m.text).toContain("9 november 2026 om 15:04");
    expect(m.text).toContain("https://zekerflex.com/dashboard/account/passkeys");
    expect(m.text).toContain("https://zekerflex.com/wachtwoord-vergeten");
  });

  it("zonder passkeys: niets te doen, geen mail", async () => {
    h.state.passkeys = [];
    expect(await wisPasskeysNaHerstel("usr_1")).toBe(0);
    expect(h.state.mails).toHaveLength(0);
    expect(h.state.audits).toHaveLength(0);
  });
});

describe("tweestapsverificatie aangezet", () => {
  it("de passkeys blijven staan, de gebruiker krijgt een mail welke er zijn", async () => {
    h.state.passkeys = [{ id: "pk_1", userId: "usr_1", name: "iPhone", createdAt: new Date("2026-11-01T10:00:00+01:00") }];
    await meldPasskeysNaTweestaps("usr_1", new Date("2026-11-09T14:04:00Z"));
    expect(h.state.passkeys).toHaveLength(1);
    expect(h.state.mails).toHaveLength(1);
    expect(h.state.mails[0]).toMatchObject({ to: "jan@example.test", kind: "passkey-tweestaps", subject: "Tweestapsverificatie staat aan, je passkeys blijven werken" });
    expect(h.state.mails[0]!.text).toContain("iPhone");
    expect(h.state.mails[0]!.text).toContain("Was jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord");
  });

  it("zonder passkeys geen mail, en een fout breekt het aanzetten niet", async () => {
    h.state.passkeys = [];
    await meldPasskeysNaTweestaps("usr_1");
    expect(h.state.mails).toHaveLength(0);
    h.state.passkeys = [{ id: "pk_1", userId: "usr_1", name: "iPhone", createdAt: new Date("2026-11-01T10:00:00+01:00") }];
    h.state.mailGooit = true;
    await expect(meldPasskeysNaTweestaps("usr_1")).resolves.toBeUndefined();
  });
});
