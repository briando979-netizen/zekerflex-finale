import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  };
});

const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
}));

const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

import { POST } from "@/app/api/admin/mail/send/route";

const ADMIN = { userId: "admin1", email: "admin@zekerflex.com", grants: [{ role: "PLATFORM_ADMIN", organizationId: "", locationIds: [] }] };

function req(body: unknown) {
  return new Request("http://localhost/api/admin/mail/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/mail/send", () => {
  it("sends the composed mail with the admin's own reply-to and logs an audit entry", async () => {
    requirePrincipal.mockResolvedValue(ADMIN);
    sendMail.mockResolvedValue({ delivered: true, transport: "smtp" });

    const res = await POST(req({ to: "freelancer@example.nl", subject: "Over je klus", text: "Hoi,\n\nBedankt." }), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.delivered).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "freelancer@example.nl", replyTo: "admin@zekerflex.com", kind: "admin-bericht", subject: "Over je klus" }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.mail.sent", summary: expect.stringContaining("freelancer@example.nl") }),
    );
  });

  it("rejects an invalid recipient address", async () => {
    requirePrincipal.mockResolvedValue(ADMIN);
    const res = await POST(req({ to: "not-an-email", subject: "x", text: "y" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("requires PLATFORM_ADMIN", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1", email: "a@b.nl", grants: [{ role: "FREELANCER", organizationId: "", locationIds: [] }] });
    const res = await POST(req({ to: "x@y.nl", subject: "x", text: "y" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
