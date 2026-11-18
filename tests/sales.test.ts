import { afterEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined, chatJson: (...a: unknown[]) => chatJson(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const outreachFindUnique = vi.fn();
const outreachCreate = vi.fn();
// een concept dat nog wacht (DRAFT/APPROVED/SCHEDULED) voor dezelfde lead; standaard geen
const outreachFindFirst = vi.fn().mockResolvedValue(null);
const outreachUpdate = vi.fn();
// de vaste tekst van de campagne (lib/sales/campagne-tekst-opslag.ts); standaard geen
const leesCampagneTekst = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/sales/campagne-tekst-opslag", () => ({ leesCampagneTekst: (...a: unknown[]) => leesCampagneTekst(...a) }));
const leadUpdate = vi.fn();
const leadFindUnique = vi.fn();
const txn = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (arg: unknown) => txn(arg as unknown[]),
    salesOutreach: {
      findUnique: (...a: unknown[]) => outreachFindUnique(...a),
      findFirst: (...a: unknown[]) => outreachFindFirst(...a),
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

afterEach(() => {
  vi.clearAllMocks();
  outreachFindFirst.mockResolvedValue(null);
  leesCampagneTekst.mockResolvedValue(null);
});

// 18 nov 2026: nooit een tweede open concept per lead, en een campagne met een vaste tekst schrijft zonder model.
describe("sales outreach: één open concept en de vaste campagnetekst", () => {
  const lead = { id: "lead_1", companyName: "Bakkerij Acme", contactName: null, city: "Zwolle", campaignId: "c1", status: "NEW", enrichmentJson: {} };
  const vast = {
    onderwerp: "Aanbod voor {bedrijf}",
    tekst: "Beste {aanhef},\n\nWij helpen {bedrijf} in {plaats}.",
    zonderVacature: true,
    bijgewerkt: "2026-11-18T10:00:00.000Z",
    door: "beheer@zekerflex.test",
  };

  it("staat er al een concept klaar, dan komt dat terug en maakt hij niets nieuws (ook het model wordt niet gevraagd)", async () => {
    leadFindUnique.mockResolvedValue(lead);
    outreachFindFirst.mockResolvedValue({ id: "o_bestaand", status: "DRAFT", subject: "Al klaar" });
    const out = await draftOutreach("lead_1", "usr_admin");
    expect(out.id).toBe("o_bestaand");
    expect(outreachFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leadId: "lead_1", status: { in: ["DRAFT", "SCHEDULED", "APPROVED"] } } }),
    );
    expect(outreachCreate).not.toHaveBeenCalled();
    expect(chatJson).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("een campagne met een vaste tekst: de tekst van de eigenaar ingevuld, zonder model", async () => {
    leadFindUnique.mockResolvedValue(lead);
    leesCampagneTekst.mockResolvedValue(vast);
    outreachCreate.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: "o2", ...a.data }));
    leadUpdate.mockResolvedValue({});
    await draftOutreach("lead_1", "usr_admin");
    expect(leesCampagneTekst).toHaveBeenCalledWith("c1");
    expect(chatJson).not.toHaveBeenCalled();
    expect(outreachCreate).toHaveBeenCalledWith({
      data: {
        leadId: "lead_1",
        subject: "Aanbod voor Bakkerij Acme",
        body: "Beste heer/mevrouw,\n\nWij helpen Bakkerij Acme in Zwolle.",
        stepIndex: 0,
        status: "DRAFT",
        generatedByModel: "campagne-tekst",
      },
    });
  });

  it("de motor geeft de tekst mee: dan leest het concept hem niet nog eens", async () => {
    leadFindUnique.mockResolvedValue(lead);
    outreachCreate.mockResolvedValue({ id: "o3" });
    leadUpdate.mockResolvedValue({});
    await draftOutreach("lead_1", null, 0, { campagneTekst: vast });
    expect(leesCampagneTekst).not.toHaveBeenCalled();
    expect(chatJson).not.toHaveBeenCalled();
  });

  it("een vaste aanbodmail krijgt geen vervolgmail (stap 2 of 3)", async () => {
    leadFindUnique.mockResolvedValue(lead);
    await expect(draftOutreach("lead_1", null, 1, { campagneTekst: vast })).rejects.toMatchObject({ status: 412 });
    expect(outreachCreate).not.toHaveBeenCalled();
  });
});

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
