import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inlogJson, meldAan, nieuwToestel, type Toestel } from "@/tests/helpers/webauthn-toestel";

// ---------------------------------------------------------------------------
// Inloggen met een passkey van begin tot eind (lib/auth/passkey/inloggen.ts):
// challenge ophalen → toestel ondertekent → authorizePasskey. Redis is een
// kleine kaart in het geheugen, de database een nagebootste passkey-rij.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const state = {
    redis: new Map<string, string>(),
    redisStoring: false,
    passkey: null as null | Record<string, unknown>,
    updateMany: [] as Record<string, unknown>[],
    userUpdates: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    failures: [] as string[],
    cleared: [] as string[],
    locked: false,
    tweestaps: false,
    limietOp: "" as string,
    findUnique: 0,
  };
  return { state };
});

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.com", NODE_ENV: "test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    set: async (k: string, v: string) => {
      if (h.state.redisStoring) throw new Error("Redis weg");
      h.state.redis.set(k, v);
      return "OK";
    },
    getdel: async (k: string) => {
      if (h.state.redisStoring) throw new Error("Redis weg");
      const v = h.state.redis.get(k) ?? null;
      h.state.redis.delete(k);
      return v;
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  fixedWindow: async (key: string) => ({ ok: !(h.state.limietOp && key.startsWith(h.state.limietOp)) }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    passkey: {
      findUnique: async ({ where }: { where: { credentialId: string } }) => {
        h.state.findUnique++;
        const p = h.state.passkey;
        return p && p.credentialId === where.credentialId ? p : null;
      },
      updateMany: async (args: { where: { id: string; signCount: bigint }; data: Record<string, unknown> }) => {
        h.state.updateMany.push(args);
        const p = h.state.passkey;
        if (!p || p.signCount !== args.where.signCount) return { count: 0 };
        p.signCount = args.data.signCount;
        return { count: 1 };
      },
    },
    user: { update: async ({ data }: { data: Record<string, unknown> }) => h.state.userUpdates.push(data) },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void h.state.audits.push(a) }));
vi.mock("@/lib/metrics", () => ({ recordLoginFailure: () => undefined }));
vi.mock("@/lib/auth/two-factor", () => ({ hasTwoFactor: async () => h.state.tweestaps }));
vi.mock("@/lib/auth/login-throttle", () => ({
  MAX_FAILURES: 5,
  checkLoginAllowed: async () => (h.state.locked ? { allowed: false, retryAfterSeconds: 600 } : { allowed: true, retryAfterSeconds: 0 }),
  registerLoginFailure: async (email: string) => {
    h.state.failures.push(email);
    return { failures: h.state.failures.length, locked: false };
  },
  clearLoginFailures: async (email: string) => void h.state.cleared.push(email),
}));

import { authorizePasskey, startPasskeyInlog } from "@/lib/auth/passkey/inloggen";
import { PasskeyFout } from "@/lib/auth/passkey/fout";

const RP = "zekerflex.com";
const ORIGIN = "https://zekerflex.com";
const NU = new Date("2026-11-09T14:00:00+01:00");

let toestel: Toestel;

function rijVoor(t: Toestel, extra: Record<string, unknown> = {}) {
  return {
    id: "pk_1",
    credentialId: t.credentialId.toString("base64url"),
    publicKey: t.cose,
    algorithm: t.alg,
    signCount: BigInt(t.teller),
    userHandle: t.userHandle.toString("base64url"),
    user: { id: "usr_1", email: "Jan@Example.test", fullName: "Jan", disabledAt: null },
    ...extra,
  };
}

/** Haal een challenge op zoals de browser doet: id voor het cookie + de opties. */
async function begin() {
  const { opties, ceremonieId } = await startPasskeyInlog("203.0.113.9");
  return { opties, cookie: `andere=1; zf_passkey=${ceremonieId}` };
}

function verzoek(cookie: string) {
  return new Request("http://app:3000/api/auth/callback/passkey", {
    method: "POST",
    headers: { cookie, "x-forwarded-for": "203.0.113.9", host: "app:3000", "x-forwarded-host": "zekerflex.com" },
  });
}

async function log(cookie: string, a: ReturnType<typeof meldAan>, t: Toestel = toestel) {
  return authorizePasskey({ response: JSON.stringify(inlogJson(t, a)), remember: "1" }, verzoek(cookie), NU);
}

beforeEach(() => {
  h.state.redis.clear();
  h.state.redisStoring = false;
  h.state.updateMany.length = 0;
  h.state.userUpdates.length = 0;
  h.state.audits.length = 0;
  h.state.failures.length = 0;
  h.state.cleared.length = 0;
  h.state.locked = false;
  h.state.tweestaps = false;
  h.state.limietOp = "";
  h.state.findUnique = 0;
  toestel = nieuwToestel();
  h.state.passkey = rijVoor(toestel);
});
afterEach(() => vi.clearAllMocks());

describe("begin: challenge", () => {
  it("geeft opties voor zekerflex.com en bewaart de challenge 5 minuten in Redis", async () => {
    const { opties, ceremonieId } = await startPasskeyInlog("203.0.113.9");
    expect(opties).toMatchObject({ rpId: RP, userVerification: "preferred", allowCredentials: [], timeout: 300_000 });
    expect(opties.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.state.redis.get(`zf:passkey:inlog:${ceremonieId}`)).toBe(opties.challenge);
  });

  it("aanvraaglimiet per IP: 429 met eigen code, geen 403", async () => {
    h.state.limietOp = "rl:passkey-start:";
    await expect(startPasskeyInlog("203.0.113.9")).rejects.toMatchObject({ code: "TE_VAAK", status: 429 });
  });

  it("Redis weg: geen passkey (503), en het zegt: log in met je wachtwoord", async () => {
    h.state.redisStoring = true;
    const err = await startPasskeyInlog("203.0.113.9").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PasskeyFout);
    expect(err).toMatchObject({ code: "PASSKEY_STORING", status: 503 });
  });
});

describe("einde: authorizePasskey", () => {
  it("een geldige aanmelding logt in, zet de teller en schrijft de audit", async () => {
    const { opties, cookie } = await begin();
    const uit = await log(cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: opties.challenge }, { teller: 4 }));
    expect(uit).toEqual({ ok: true, user: { id: "usr_1", email: "Jan@Example.test", name: "Jan", remember: true } });
    expect(h.state.updateMany[0]).toMatchObject({ where: { id: "pk_1", signCount: 0n }, data: { signCount: 4n, lastUsedAt: NU } });
    expect(h.state.cleared).toEqual(["jan@example.test"]);
    expect(h.state.userUpdates[0]).toEqual({ lastLoginAt: NU });
    expect(h.state.audits.at(-1)).toMatchObject({ action: "auth.login.succeeded", actorUserId: "usr_1", metadata: { methode: "passkey", uv: true } });
  });

  it("een hergebruikte challenge wordt geweigerd", async () => {
    const { opties, cookie } = await begin();
    const c = { rpId: RP, origin: ORIGIN, challenge: opties.challenge };
    expect((await log(cookie, meldAan(toestel, c))).ok).toBe(true);
    expect(await log(cookie, meldAan(toestel, c, { teller: 0 }))).toEqual({ ok: false, code: "passkey_verlopen" });
  });

  it("de challenge is meteen weg, ook als de controle faalt", async () => {
    const { opties, cookie } = await begin();
    const c = { rpId: RP, origin: ORIGIN, challenge: opties.challenge };
    const ander = nieuwToestel();
    expect(await log(cookie, meldAan(toestel, c, { sleutel: ander.privateKey }))).toEqual({ ok: false, code: "passkey_mislukt" });
    expect(h.state.redis.size).toBe(0);
    // dezelfde challenge met een goede handtekening: te laat
    expect(await log(cookie, meldAan(toestel, c))).toEqual({ ok: false, code: "passkey_verlopen" });
  });

  it("zonder cookie of met een onbekende id: verlopen, de database wordt niet eens gevraagd", async () => {
    const { opties } = await begin();
    const a = meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: opties.challenge });
    expect(await log("", a)).toEqual({ ok: false, code: "passkey_verlopen" });
    expect(await log("zf_passkey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", a)).toEqual({ ok: false, code: "passkey_verlopen" });
    expect(h.state.findUnique).toBe(0);
  });

  it("Redis weg bij de controle: NOOIT doorlaten (fail-closed)", async () => {
    const { opties, cookie } = await begin();
    h.state.redisStoring = true;
    expect(await log(cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: opties.challenge }))).toEqual({ ok: false, code: "passkey_storing" });
    expect(h.state.findUnique).toBe(0);
    expect(h.state.audits.some((a) => a.action === "auth.login.succeeded")).toBe(false);
  });

  it("een vervalste origin telt als mislukte poging", async () => {
    const { opties, cookie } = await begin();
    const uit = await log(cookie, meldAan(toestel, { rpId: RP, origin: "https://zekerflex.com.evil.example", challenge: opties.challenge }));
    expect(uit).toEqual({ ok: false, code: "passkey_mislukt" });
    expect(h.state.failures).toEqual(["jan@example.test"]);
    expect(h.state.audits.at(-1)).toMatchObject({ action: "auth.login.failed", metadata: { reden: "origin", methode: "passkey" } });
  });

  it("een verkeerde rpIdHash wordt geweigerd", async () => {
    const { opties, cookie } = await begin();
    expect(await log(cookie, meldAan(toestel, { rpId: "evil.example", origin: ORIGIN, challenge: opties.challenge }))).toEqual({ ok: false, code: "passkey_mislukt" });
  });

  it("een dalende teller wordt geweigerd en als beveiligingsmelding gelogd", async () => {
    h.state.passkey = rijVoor(toestel, { signCount: 10n });
    const { opties, cookie } = await begin();
    const uit = await log(cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: opties.challenge }, { teller: 3 }));
    expect(uit).toEqual({ ok: false, code: "passkey_mislukt" });
    expect(h.state.updateMany).toHaveLength(0);
    expect(h.state.audits.at(-1)).toMatchObject({ category: "SECURITY", severity: "warning", metadata: { reden: "teller" } });
  });

  it("twee inlogs met dezelfde tellerstand: de tweede gaat niet door", async () => {
    h.state.passkey = rijVoor(toestel, { signCount: 5n });
    const a1 = await begin();
    const a2 = await begin();
    expect((await log(a1.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: a1.opties.challenge }, { teller: 6 }))).ok).toBe(true);
    expect(await log(a2.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: a2.opties.challenge }, { teller: 6 }))).toEqual({ ok: false, code: "passkey_mislukt" });
  });

  it("een onbekende passkey en een uitgeschakeld (of gewist) account worden geweigerd", async () => {
    const vreemd = nieuwToestel();
    let b = await begin();
    expect(await log(b.cookie, meldAan(vreemd, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge }), vreemd)).toEqual({ ok: false, code: "passkey_onbekend" });

    h.state.passkey = rijVoor(toestel, { user: { id: "usr_1", email: "verwijderd-usr_1@verwijderd.zekerflex.invalid", fullName: "Verwijderde gebruiker", disabledAt: new Date("2026-11-01T10:00:00+01:00") } });
    b = await begin();
    expect(await log(b.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge }))).toEqual({ ok: false, code: "passkey_onbekend" });
    expect(h.state.audits.some((a) => a.action === "auth.login.succeeded")).toBe(false);
  });

  it("een passkey van een andere gebruiker (andere user handle) wordt geweigerd", async () => {
    h.state.passkey = rijVoor(toestel, { userHandle: Buffer.alloc(32, 1).toString("base64url") });
    const { opties, cookie } = await begin();
    expect(await log(cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: opties.challenge }))).toEqual({ ok: false, code: "passkey_mislukt" });
  });

  it("tweestapsverificatie aan: zonder UV geweigerd, met UV ingelogd (2FA wordt niet omzeild)", async () => {
    h.state.tweestaps = true;
    let b = await begin();
    expect(await log(b.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge, vlaggen: { uv: false } }))).toEqual({ ok: false, code: "passkey_uv" });
    b = await begin();
    expect((await log(b.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge }))).ok).toBe(true);
  });

  it("tweestapsverificatie uit: UV naar keuze", async () => {
    const b = await begin();
    expect((await log(b.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge, vlaggen: { uv: false } }))).ok).toBe(true);
  });

  it("zelfde inlogslot als het wachtwoord", async () => {
    h.state.locked = true;
    const b = await begin();
    expect(await log(b.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge }))).toEqual({ ok: false, code: "locked" });
    expect(h.state.audits.at(-1)).toMatchObject({ action: "auth.login.locked" });
  });

  it("aanvraaglimiet per IP op het einde", async () => {
    const b = await begin();
    h.state.limietOp = "rl:passkey-inloggen:203.0.113.9";
    expect(await log(b.cookie, meldAan(toestel, { rpId: RP, origin: ORIGIN, challenge: b.opties.challenge }))).toEqual({ ok: false, code: "passkey_te_vaak" });
  });

  it("kapotte invoer: geweigerd zonder te gooien (en de challenge is verbruikt)", async () => {
    const b = await begin();
    expect(await authorizePasskey({ response: "{kapot" }, verzoek(b.cookie), NU)).toEqual({ ok: false, code: "passkey_mislukt" });
    expect(h.state.redis.size).toBe(0);
    const b2 = await begin();
    expect(await authorizePasskey({ response: JSON.stringify({ id: "a", rawId: "b", type: "public-key", response: {} }) }, verzoek(b2.cookie), NU)).toEqual({ ok: false, code: "passkey_mislukt" });
  });
});
