import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

const imapConfig = vi.fn();
vi.mock("@/lib/mail", () => ({ imapConfig: (...a: unknown[]) => imapConfig(...a) }));

const fetchInboxList = vi.fn();
const fetchMessageText = vi.fn();
vi.mock("@/lib/mail/imap", () => ({
  fetchInboxList: (...a: unknown[]) => fetchInboxList(...a),
  fetchMessageText: (...a: unknown[]) => fetchMessageText(...a),
}));

import { GET as getInbox } from "@/app/api/admin/mail/inbox/route";
import { GET as getMessage } from "@/app/api/admin/mail/inbox/[uid]/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };
const CFG = { host: "imap.transip.email", port: 993, secure: true, user: "info@zekerflex.com", pass: "x" };

afterEach(() => vi.clearAllMocks());

describe("GET /api/admin/mail/inbox", () => {
  it("returns the real inbox list when IMAP is configured", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchInboxList.mockResolvedValue([{ uid: 1, seq: 1, date: null, subject: "Test", fromName: "ZekerFlex", fromAddress: "noreply@zekerflex.com", seen: true }]);

    const res = await getInbox(new Request("http://localhost/api/admin/mail/inbox"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.host).toBe("imap.transip.email");
    expect(json.messages).toHaveLength(1);
    expect(fetchInboxList).toHaveBeenCalledWith(CFG, 50);
  });

  it("explains clearly when no IMAP mailbox is configured, instead of a generic failure", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(null);

    const res = await getInbox(new Request("http://localhost/api/admin/mail/inbox"));
    const json = await res.json();
    expect(res.status).toBe(412);
    expect(json.error.message).toContain("IMAP");
    expect(fetchInboxList).not.toHaveBeenCalled();
  });

  it("surfaces an IMAP connection failure as an upstream error, not a 500 crash", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchInboxList.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await getInbox(new Request("http://localhost/api/admin/mail/inbox"));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/admin/mail/inbox/:uid", () => {
  it("returns the message text for a valid uid", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchMessageText.mockResolvedValue("Nieuwe bestelling via de ZekerFlex-shop");

    const res = await getMessage(new Request("http://localhost/api/admin/mail/inbox/124"), { params: Promise.resolve({ uid: "124" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.text).toContain("ZekerFlex-shop");
    expect(fetchMessageText).toHaveBeenCalledWith(CFG, 124);
  });

  it("rejects a non-numeric uid", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);

    const res = await getMessage(new Request("http://localhost/api/admin/mail/inbox/not-a-number"), { params: Promise.resolve({ uid: "not-a-number" }) });
    expect(res.status).toBe(422);
    expect(fetchMessageText).not.toHaveBeenCalled();
  });
});
