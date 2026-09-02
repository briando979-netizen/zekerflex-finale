import { afterEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
vi.mock("@/lib/ai/client", () => ({ chatJson: (...a: unknown[]) => chatJson(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const outreachFindUnique = vi.fn();
const outreachCreate = vi.fn();
const outreachUpdate = vi.fn();
const leadUpdate = vi.fn();
const leadFindUnique = vi.fn();
const txn = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (arg: unknown) => txn(arg as unknown[]),
    salesOutreach: {
      findUnique: (...a: unknown[]) => outreachFindUnique(...a),
      create: (...a: unknown[]) => outreachCreate(...a),
      update: (...a: unknown[]) => outreachUpdate(...a),
    },
    salesLead: {
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
    },
  },
}));

import {
  approveOutreach,
  draftOutreach,
  markOutreachSent,
} from "@/lib/sales/outreach";

afterEach(() => vi.clearAllMocks());

describe("sales outreach state machine", () => {
  it("drafts an email from the model reply", async () => {
    leadFindUnique.mockResolvedValue({
      id: "lead_1",
      companyName: "Jumbo",
      status: "NEW",
      enrichmentJson: {},
    });
    chatJson.mockResolvedValue({ subject: "Samenwerken?", body: "Beste,\nGraag." });
    outreachCreate.mockResolvedValue({ id: "o1", subject: "Samenwerken?", status: "DRAFT" });
    leadUpdate.mockResolvedValue({});

    const out = await draftOutreach("lead_1", "usr_admin");
    expect(out.id).toBe("o1");
    expect(outreachCreate).toHaveBeenCalledOnce();
  });

  it("refuses to approve anything that is not a DRAFT", async () => {
    outreachFindUnique.mockResolvedValue({ id: "o1", status: "SENT", leadId: "lead_1" });
    await expect(approveOutreach("o1", "usr_admin")).rejects.toMatchObject({
      status: 412,
    });
  });

  it("refuses to mark sent unless APPROVED", async () => {
    outreachFindUnique.mockResolvedValue({ id: "o1", status: "DRAFT", leadId: "lead_1" });
    await expect(markOutreachSent("o1", "usr_admin")).rejects.toMatchObject({
      status: 412,
    });
  });

  it("marks an APPROVED outreach as sent", async () => {
    outreachFindUnique.mockResolvedValue({ id: "o1", status: "APPROVED", leadId: "lead_1" });
    outreachUpdate.mockResolvedValue({ id: "o1", status: "SENT" });
    leadUpdate.mockResolvedValue({});
    const res = await markOutreachSent("o1", "usr_admin");
    expect(res.status).toBe("SENT");
  });
});
