import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const mails: { to: string; text: string }[] = [];
let tweeStap = false;
let rateOk = true;
let mailOk = true;

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: async () => ({ email: "werker@example.test", fullName: "Jan Jansen" }) } },
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-geheim-test-geheim-test-geheim" } }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => store.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void store.set(k, v),
  kvDelete: async (k: string) => void store.delete(k),
}));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: async () => ({ ok: rateOk }) }));
vi.mock("@/lib/auth/two-factor", () => ({
  hasTwoFactor: async () => tweeStap,
  verifySecondFactor: async (_u: string, c: string) => ({ ok: c === "123456" }),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; text: string }) => {
    mails.push(m);
    return { delivered: mailOk };
  },
}));

import { bevestigIbanWijziging } from "@/lib/fiscal/iban-bevestiging";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const IBAN = "NL91ABNA0417164300";
const NU = Date.parse("2026-11-09T10:00:00+01:00");

function codeUitMail(): string {
  const m = mails.at(-1)?.text.match(/\n(\d{6})\n/);
  return m?.[1] ?? "";
}

beforeEach(() => {
  store.clear();
  mails.length = 0;
  tweeStap = false;
  rateOk = true;
  mailOk = true;
});

describe("bevestigIbanWijziging (mailcode)", () => {
  it("stuurt zonder code een code per mail en geeft 423", async () => {
    const r = await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    expect(r).toMatchObject({ ok: false, status: 423, code: "IBAN_BEVESTIGING_NODIG" });
    expect(mails).toHaveLength(1);
    expect(mails[0]?.to).toBe("werker@example.test");
    expect(codeUitMail()).toMatch(/^\d{6}$/);
    // het volledige IBAN staat niet in de mail
    expect(mails[0]?.text).not.toContain(IBAN);
  });

  it("accepteert de juiste code eenmalig", async () => {
    await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    const code = codeUitMail();
    expect(await bevestigIbanWijziging("u1", IBAN, code, NU + 60_000)).toEqual({ ok: true });
    // tweede keer met dezelfde code: weg
    expect(await bevestigIbanWijziging("u1", IBAN, code, NU + 61_000)).toMatchObject({ ok: false, code: "IBAN_CODE_VERLOPEN" });
  });

  it("weigert een foute code en telt pogingen; na vijf is de code vervallen", async () => {
    await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    const goed = codeUitMail();
    const fout = goed === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      expect(await bevestigIbanWijziging("u1", IBAN, fout, NU + 1000)).toMatchObject({ ok: false, code: "IBAN_CODE_ONGELDIG" });
    }
    expect(await bevestigIbanWijziging("u1", IBAN, goed, NU + 2000)).toMatchObject({ ok: false, code: "IBAN_CODE_VERLOPEN" });
  });

  it("weigert een verlopen code (na 15 minuten)", async () => {
    await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    const code = codeUitMail();
    expect(await bevestigIbanWijziging("u1", IBAN, code, NU + 16 * 60_000)).toMatchObject({ ok: false, code: "IBAN_CODE_VERLOPEN" });
  });

  it("de code geldt alleen voor het IBAN waarvoor hij is aangevraagd", async () => {
    await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    const code = codeUitMail();
    expect(await bevestigIbanWijziging("u1", "NL02ABNA0123456789", code, NU + 1000)).toMatchObject({ ok: false, code: "IBAN_CODE_VERLOPEN" });
  });

  it("de code van een andere gebruiker werkt niet", async () => {
    await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    const code = codeUitMail();
    expect(await bevestigIbanWijziging("u2", IBAN, code, NU + 1000)).toMatchObject({ ok: false });
  });

  it("geeft 429 als de limiet bereikt is, en 503 (zonder open code) als de mail mislukt", async () => {
    rateOk = false;
    expect(await bevestigIbanWijziging("u1", IBAN, undefined, NU)).toMatchObject({ ok: false, status: 429 });
    expect(mails).toHaveLength(0);
    rateOk = true;
    mailOk = false;
    expect(await bevestigIbanWijziging("u1", IBAN, undefined, NU)).toMatchObject({ ok: false, status: 503 });
    expect(store.size).toBe(0);
  });

  it("slaat alleen een HMAC van de code op, niet de code zelf", async () => {
    await bevestigIbanWijziging("u1", IBAN, undefined, NU);
    expect(JSON.stringify([...store.values()])).not.toContain(codeUitMail());
  });
});

describe("bevestigIbanWijziging (2FA)", () => {
  beforeEach(() => {
    tweeStap = true;
  });

  it("vraagt om een code zonder er een te mailen", async () => {
    expect(await bevestigIbanWijziging("u1", IBAN, undefined, NU)).toMatchObject({ ok: false, status: 423, code: "IBAN_2FA_NODIG" });
    expect(mails).toHaveLength(0);
  });

  it("accepteert een geldige 2FA-code en weigert een foute", async () => {
    expect(await bevestigIbanWijziging("u1", IBAN, "123456", NU)).toEqual({ ok: true });
    expect(await bevestigIbanWijziging("u1", IBAN, "999999", NU)).toMatchObject({ ok: false, code: "IBAN_CODE_ONGELDIG" });
  });
});

describe("AVG", () => {
  it("de KV-sleutel valt onder het wissen van gebruikersgegevens", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("iban-wijziging:");
  });
});
