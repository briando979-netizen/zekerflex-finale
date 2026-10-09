import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/analytics/track", () => ({ recordServerEvent: vi.fn() }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn().mockResolvedValue({ delivered: true }),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
}));

const createLead = vi.fn();
vi.mock("@/lib/sales/leads", () => ({ createLead: (...a: unknown[]) => createLead(...a) }));

import { POST } from "@/app/api/uitzendbureau/route";

function req(body: unknown) {
  return new Request("http://localhost/api/uitzendbureau", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  contactName: "Jan de Vries",
  company: "Logistiek B.V.",
  email: "jan@logistiekbv.nl",
  phone: "0612345678",
  headcount: "3-5",
  sector: "logistiek",
  note: "We zoeken heftruckchauffeurs.",
  consent: true,
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/uitzendbureau", () => {
  it("creates a sales lead tagged \"uitzendbureau\" from a valid request", async () => {
    createLead.mockResolvedValue({ id: "lead1" });

    const res = await POST(req(valid));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Logistiek B.V.",
        contactEmail: "jan@logistiekbv.nl",
        source: "uitzendbureau",
      }),
    );
  });

  it("rejects a request without consent", async () => {
    const res = await POST(req({ ...valid, consent: false }));
    expect(res.status).toBe(422);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("rejects a request without a company name", async () => {
    const res = await POST(req({ ...valid, company: "" }));
    expect(res.status).toBe(422);
    expect(createLead).not.toHaveBeenCalled();
  });
});
