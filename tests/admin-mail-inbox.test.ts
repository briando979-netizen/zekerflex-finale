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
const fetchMessageContent = vi.fn();
const fetchAttachment = vi.fn();
vi.mock("@/lib/mail/imap", () => ({
  fetchInboxList: (...a: unknown[]) => fetchInboxList(...a),
  fetchMessageContent: (...a: unknown[]) => fetchMessageContent(...a),
  fetchAttachment: (...a: unknown[]) => fetchAttachment(...a),
}));

import { GET as getInbox } from "@/app/api/admin/mail/inbox/route";
import { GET as getMessage } from "@/app/api/admin/mail/inbox/[uid]/route";
import { GET as getAttachment } from "@/app/api/admin/mail/inbox/[uid]/attachment/[index]/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };
const CFG = { host: "imap.transip.email", port: 993, secure: true, user: "info@zekerflex.com", pass: "x" };

afterEach(() => vi.clearAllMocks());

describe("GET /api/admin/mail/inbox", () => {
  it("returns the real inbox list when IMAP is configured", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchInboxList.mockResolvedValue([{ uid: 1, seq: 1, date: null, subject: "Test", fromName: "ZekerFlex", fromAddress: "noreply@zekerflex.com", seen: true }]);

    const res = await getInbox(new Request("http://localhost/api/admin/mail/inbox"), { params: Promise.resolve({}) });
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

    const res = await getInbox(new Request("http://localhost/api/admin/mail/inbox"), { params: Promise.resolve({}) });
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

    const res = await getInbox(new Request("http://localhost/api/admin/mail/inbox"), { params: Promise.resolve({}) });
    expect(res.status).toBe(503);
  });
});

describe("GET /api/admin/mail/inbox/:uid", () => {
  it("returns the message text and its attachment list for a valid uid", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchMessageContent.mockResolvedValue({
      text: "Nieuwe bestelling via de ZekerFlex-shop",
      attachments: [{ index: 1, filename: "pakbon.pdf", contentType: "application/pdf", size: 12345 }],
    });

    const res = await getMessage(new Request("http://localhost/api/admin/mail/inbox/124"), { params: Promise.resolve({ uid: "124" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.text).toContain("ZekerFlex-shop");
    expect(json.attachments).toEqual([{ index: 1, filename: "pakbon.pdf", contentType: "application/pdf", size: 12345 }]);
    expect(fetchMessageContent).toHaveBeenCalledWith(CFG, 124);
  });

  it("rejects a non-numeric uid", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);

    const res = await getMessage(new Request("http://localhost/api/admin/mail/inbox/not-a-number"), { params: Promise.resolve({ uid: "not-a-number" }) });
    expect(res.status).toBe(422);
    expect(fetchMessageContent).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/mail/inbox/:uid/attachment/:index", () => {
  it("streams the attachment with its real filename and content type", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchAttachment.mockResolvedValue({ filename: "pakbon.pdf", contentType: "application/pdf", bytes: Buffer.from("PDF-DATA") });

    const res = await getAttachment(
      new Request("http://localhost/api/admin/mail/inbox/124/attachment/1"),
      { params: Promise.resolve({ uid: "124", index: "1" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("pakbon.pdf");
    expect(fetchAttachment).toHaveBeenCalledWith(CFG, 124, 1);
  });

  it("404s when the attachment index doesn't exist on that message", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);
    fetchAttachment.mockResolvedValue(null);

    const res = await getAttachment(
      new Request("http://localhost/api/admin/mail/inbox/124/attachment/9"),
      { params: Promise.resolve({ uid: "124", index: "9" }) },
    );
    expect(res.status).toBe(404);
  });

  it("rejects a negative attachment index", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    imapConfig.mockReturnValue(CFG);

    const res = await getAttachment(
      new Request("http://localhost/api/admin/mail/inbox/124/attachment/-1"),
      { params: Promise.resolve({ uid: "124", index: "-1" }) },
    );
    expect(res.status).toBe(422);
    expect(fetchAttachment).not.toHaveBeenCalled();
  });
});
