import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De verkoopmailbox (21 nov 2026): 994 verkoopmails via info@ raakten de grens van TransIP en daarna kwam ook de mail van de
// app niet meer aan (inlogcodes, wachtwoord vergeten). Verkoopmail logt nu in met een eigen mailbox, en zonder die mailbox
// gaat hij NIET via de gewone: dan delivered:false met een duidelijke fout.

const h = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  smtp: vi.fn(),
  kv: new Map<string, unknown>(),
}));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/env", () => ({
  env: {
    SMTP_HOST: "smtp.mailserver.test",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: "info@zekerflex.com",
    SMTP_PASS: "app-geheim",
    SMTP_TIMEOUT_S: 5,
    MAIL_TLS_VERIFY: false,
    MAIL_FROM: "info@zekerflex.com",
    MAIL_FROM_NAME: "ZekerFlex",
    MAIL_REPLY_TO: "info@zekerflex.com",
    MAIL_SALES_FROM: "sales@zekerflex.com",
    APP_BASE_URL: "https://zekerflex.test",
  },
}));
vi.mock("@/lib/mail/smtp", () => ({ sendViaSmtp: h.smtp }));
vi.mock("@/lib/mail/store", () => ({ saveSentMessage: vi.fn(async () => undefined), readSentMessage: vi.fn(async () => null) }));
vi.mock("@/lib/mail/prefs", () => ({ getMailPrefs: vi.fn(async () => ({ token: "t" })), mailAllowed: vi.fn(async () => true) }));
vi.mock("@/lib/mail/bounce-opslag", () => ({ heeftHardeBounce: vi.fn(async () => false) }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => h.kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    if (v === null) h.kv.delete(k);
    else h.kv.set(k, v);
  }),
}));
vi.mock("@/lib/security/sealed-secret", () => ({
  sealSecret: (p: string) => `zegel:${Buffer.from(p).toString("base64")}`,
  openSecret: (s: string) => Buffer.from(s.replace(/^zegel:/, ""), "base64").toString(),
}));

import { sendMail } from "@/lib/mail";
import { VERKOOP_NIET_INGESTELD, geldigVerkoopAdres, verkoopLogin, verkoopMailboxStand, wisVerkoopLogin, zetVerkoopLogin } from "@/lib/mail/verkoop-mailbox";

beforeEach(() => {
  h.kv.clear();
  h.smtp.mockResolvedValue(undefined);
  delete process.env.SALES_SMTP_USER;
  delete process.env.SALES_SMTP_PASS;
});
afterEach(() => vi.clearAllMocks());

describe("de login van de verkoopmailbox", () => {
  it("alleen een adres op zekerflex.com", () => {
    expect(geldigVerkoopAdres("sales@zekerflex.com")).toBe(true);
    expect(geldigVerkoopAdres(" Verkoop@ZekerFlex.com ")).toBe(true);
    expect(geldigVerkoopAdres("sales@gmail.com")).toBe(false);
    expect(geldigVerkoopAdres("sales@zekerflex.com.nep.nl")).toBe(false);
    expect(geldigVerkoopAdres("zekerflex.com")).toBe(false);
  });

  it("bewaart verzegeld, en de stand noemt nooit het wachtwoord", async () => {
    await zetVerkoopLogin("Sales@zekerflex.com", "geheim-123");
    expect(JSON.stringify([...h.kv.values()])).not.toContain("geheim-123");
    expect(await verkoopLogin()).toEqual({ adres: "sales@zekerflex.com", wachtwoord: "geheim-123" });
    const stand = await verkoopMailboxStand();
    expect(stand).toEqual({ ingesteld: true, adres: "sales@zekerflex.com", bron: "beheer" });
    expect(JSON.stringify(stand)).not.toContain("geheim");
    await wisVerkoopLogin();
    expect(await verkoopMailboxStand()).toEqual({ ingesteld: false, adres: null, bron: null });
  });

  it("valt terug op SALES_SMTP_USER en SALES_SMTP_PASS uit de omgeving", async () => {
    process.env.SALES_SMTP_USER = "sales@zekerflex.com";
    process.env.SALES_SMTP_PASS = "uit-env";
    expect(await verkoopLogin()).toEqual({ adres: "sales@zekerflex.com", wachtwoord: "uit-env" });
    expect((await verkoopMailboxStand()).bron).toBe("omgeving");
  });
});

describe("sendMail kiest de mailbox per soort mail", () => {
  it("verkoopmail zonder verkoopmailbox: niet verstuurd, ook niet via de gewone mailbox", async () => {
    const res = await sendMail({ to: "eigenaar@bedrijf.nl", subject: "Kennismaking", text: "Hoi", kind: "sales-outreach", from: "sales@zekerflex.com" });
    expect(res.delivered).toBe(false);
    expect(res.error).toBe(VERKOOP_NIET_INGESTELD);
    expect(h.smtp).not.toHaveBeenCalled();
  });

  it("verkoopmail met verkoopmailbox: logt in met die mailbox", async () => {
    await zetVerkoopLogin("sales@zekerflex.com", "geheim-123");
    const res = await sendMail({ to: "eigenaar@bedrijf.nl", subject: "Kennismaking", text: "Hoi", kind: "sales-outreach", from: "sales@zekerflex.com" });
    expect(res.delivered).toBe(true);
    const [cfg, envelope] = h.smtp.mock.calls[0]!;
    expect(cfg).toMatchObject({ host: "smtp.mailserver.test", user: "sales@zekerflex.com", pass: "geheim-123" });
    expect(envelope).toMatchObject({ from: "sales@zekerflex.com", to: ["eigenaar@bedrijf.nl"] });
  });

  it("de mail van de app blijft via de gewone mailbox, ook als er een verkoopmailbox is", async () => {
    await zetVerkoopLogin("sales@zekerflex.com", "geheim-123");
    const res = await sendMail({ to: "werker@voorbeeld.nl", subject: "Je code", text: "123456", kind: "verification" });
    expect(res.delivered).toBe(true);
    expect(h.smtp.mock.calls[0]![0]).toMatchObject({ user: "info@zekerflex.com", pass: "app-geheim" });
  });

  it("een testadres gaat nooit de deur uit, ook geen verkoopmail (en geeft dan geen fout)", async () => {
    const res = await sendMail({ to: "iemand@bedrijf.test", subject: "x", text: "y", kind: "sales-outreach" });
    expect(res.delivered).toBe(false);
    expect(res.error).toBeUndefined();
    expect(h.smtp).not.toHaveBeenCalled();
  });
});

describe("Beheer en de verzendroute", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  it("de route slaat pas op na een geslaagde login en is alleen voor platformbeheer", () => {
    const route = lees("app/api/admin/mail/verkoop-mailbox/route.ts");
    expect(route).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    expect(route.indexOf("verifySmtp(")).toBeLessThan(route.indexOf("zetVerkoopLogin(adres"));
    expect(route).not.toMatch(/summary:[^\n]*wachtwoord/);
  });
  it("/api/admin/mail/send kent soort: verkoop (als sales-outreach, van sales@)", () => {
    const send = lees("app/api/admin/mail/send/route.ts");
    expect(send).toContain('soort: z.enum(["verkoop"]).optional()');
    expect(send).toContain('kind: verkoop ? "sales-outreach" : "admin-bericht"');
  });
  it("het paneel staat op Beheer → Mail en de eigenaar-taak bestaat", () => {
    expect(lees("app/admin/mail/page.tsx")).toContain("<VerkoopMailbox />");
    expect(lees("lib/admin/owner-todos.ts")).toContain('id: "verkoop-mailbox"');
  });
});
