import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "unit-test-secret-0123456789abcdefghijkl" } }));

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ requirePrincipal: () => requirePrincipal() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => store.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void store.set(k, v),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));

vi.mock("@/lib/security/public-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/public-host")>()),
  resolvePublicHost: async () => "203.0.113.10",
}));

const fetchInboxList = vi.fn();
vi.mock("@/lib/mail/imap", () => ({ fetchInboxList: (...a: unknown[]) => fetchInboxList(...a) }));
const verifySmtp = vi.fn();
const sendViaSmtp = vi.fn();
vi.mock("@/lib/mail/smtp", () => ({
  verifySmtp: (...a: unknown[]) => verifySmtp(...a),
  sendViaSmtp: (...a: unknown[]) => sendViaSmtp(...a),
}));
const listSentMessages = vi.fn();
vi.mock("@/lib/mail/store", () => ({ listSentMessages: (...a: unknown[]) => listSentMessages(...a) }));

import { DELETE, GET, PUT } from "@/app/api/me/mailbox/route";
import { POST as SEND } from "@/app/api/me/mailbox/send/route";
import { GET as ZEKERFLEX } from "@/app/api/me/mailbox/zekerflex/route";

const CONNECT = {
  email: "planning@bakkerijbol.nl",
  password: "app-pass-123",
  displayName: "Bakkerij Bol",
  imap: { host: "imap.bakkerijbol.nl", port: 993, secure: true },
  smtp: { host: "smtp.bakkerijbol.nl", port: 587, secure: false },
};
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/me/mailbox", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  store.clear();
  requirePrincipal.mockResolvedValue({ userId: "u_bol", email: "eigenaar@bakkerijbol.nl" });
  fetchInboxList.mockResolvedValue([]);
  verifySmtp.mockResolvedValue(undefined);
  sendViaSmtp.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("connecting a mailbox", () => {
  it("tests both servers over vetted, certificate-checked TLS and stores only a sealed password", async () => {
    const res = await put(CONNECT);
    expect(res.status).toBe(200);
    const imapCfg = fetchInboxList.mock.calls[0]![0];
    expect(imapCfg).toMatchObject({ host: "imap.bakkerijbol.nl", address: "203.0.113.10", port: 993, secure: true, verifyTls: true });
    expect(verifySmtp.mock.calls[0]![0]).toMatchObject({ port: 587, secure: false, verifyTls: true, requireTls: true, address: "203.0.113.10" });

    const saved = store.get("mailbox-connection:u_bol") as Record<string, unknown>;
    expect(JSON.stringify(saved)).not.toContain("app-pass-123");
    expect(saved.passwordSealed).toMatch(/^v1\./);

    const body = await (await GET()).json();
    expect(body.connected).toBe(true);
    expect(JSON.stringify(body)).not.toContain("passwordSealed");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "mailbox.connected" }));
  });

  it("refuses unencrypted ports", async () => {
    expect((await put({ ...CONNECT, imap: { ...CONNECT.imap, port: 143, secure: false } })).status).toBe(422);
    expect((await put({ ...CONNECT, smtp: { ...CONNECT.smtp, port: 25 } })).status).toBe(422);
    expect(fetchInboxList).not.toHaveBeenCalled();
  });

  it("explains that Outlook/Microsoft 365 needs OAuth instead of failing obscurely", async () => {
    const res = await put({ ...CONNECT, email: "baas@outlook.com" });
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/OAuth/);
  });

  it("stores nothing when the login is refused, and says why", async () => {
    fetchInboxList.mockRejectedValue(new Error("NO [AUTHENTICATIONFAILED] Invalid credentials"));
    const res = await put(CONNECT);
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/Inloggen geweigerd/);
    expect(store.size).toBe(0);
  });

  it("disconnecting forgets the connection", async () => {
    await put(CONNECT);
    await DELETE();
    expect(store.has("mailbox-connection:u_bol")).toBe(false);
  });
});

describe("sending and the ZekerFlex tab", () => {
  const send = (body: unknown) =>
    SEND(new Request("http://localhost/api/me/mailbox/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("needs a connected mailbox", async () => {
    expect((await send({ to: "jan@example.nl", subject: "Hoi", text: "Test" })).status).toBe(412);
  });

  it("sends from the connected address and keeps a copy for the Verstuurd tab", async () => {
    await put(CONNECT);
    const res = await send({ to: "jan@example.nl", subject: "Rooster", text: "Tot morgen" });
    expect(res.status).toBe(200);
    const [cfg, envelope] = sendViaSmtp.mock.calls[0]!;
    expect(cfg).toMatchObject({ user: "planning@bakkerijbol.nl", pass: "app-pass-123", requireTls: true });
    expect(envelope).toMatchObject({ from: "planning@bakkerijbol.nl", to: ["jan@example.nl"] });
    expect([...store.keys()].some((k) => k.startsWith("mailbox-sent:u_bol:"))).toBe(true);
  });

  it("rejects a recipient list smuggled into one address", async () => {
    await put(CONNECT);
    expect((await send({ to: "a@b.nl,c@d.nl", subject: "x", text: "y" })).status).toBe(422);
  });

  it("shows only platform mail to this account, not suppressed ones", async () => {
    listSentMessages.mockResolvedValue([
      { id: "1", at: "2026-10-15T08:00:00Z", to: ["Eigenaar@BakkerijBol.nl"], subject: "Factuur PF-1", text: "…", kind: "invoice" },
      { id: "2", at: "2026-10-15T07:00:00Z", to: ["iemand@anders.nl"], subject: "Niet voor jou", text: "…", kind: "x" },
      { id: "3", at: "2026-10-15T06:00:00Z", to: ["eigenaar@bakkerijbol.nl"], subject: "Afgemeld", text: "…", kind: "x", suppressed: "afgemeld" },
    ]);
    const body = await (await ZEKERFLEX()).json();
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["1"]);
  });
});
