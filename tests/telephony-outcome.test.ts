import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord } from "@/lib/telephony/store";

let current: CallRecord | null = null;
const patchCall = vi.fn(async (..._a: unknown[]) => null);
vi.mock("@/lib/telephony/store", () => ({
  getCall: async () => current,
  patchCall: (...a: unknown[]) => patchCall(...a),
}));
const createLead = vi.fn(async (..._a: unknown[]) => ({ id: "lead-new" }));
vi.mock("@/lib/sales/leads", () => ({ createLead: (...a: unknown[]) => createLead(...a) }));
const chat = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  chat: (...a: unknown[]) => chat(...a),
  fastModel: () => "test-model",
  llmConfigProblem: () => null,
  ensureAiNode: async () => undefined,
}));
const alertOwner = vi.fn(async (..._a: unknown[]) => "sent");
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));
const leadUpdate = vi.fn(async (..._a: unknown[]) => ({}));
const leadFind = vi.fn(async (..._a: unknown[]) => ({ id: "lead-1", notes: "oud" }));
vi.mock("@/lib/prisma", () => ({
  prisma: { salesLead: { update: (...a: unknown[]) => leadUpdate(...a), findUnique: (...a: unknown[]) => leadFind(...a) } },
}));

import { captureCallOutcome } from "@/lib/telephony/outcome";

const OURS = "+3197010251797";
const THEIRS = "+31612345678";

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: "c1",
    at: "2026-10-31T10:00:00Z",
    updatedAt: "2026-10-31T10:00:00Z",
    direction: "outbound",
    toNumber: THEIRS,
    fromNumber: OURS,
    status: "completed",
    script: "intro-werkgever",
    transcript: [
      { at: "t", who: "ai", text: "opening" },
      { at: "t", who: "beller", text: "Ik zoek personeel" },
      { at: "t", who: "ai", text: "Wat is uw naam?" },
      { at: "t", who: "beller", text: "Marit, bel me morgen" },
    ],
    ...overrides,
  };
}

const interested = JSON.stringify({ interested: true, kind: "werkgever", contactName: "Marit", company: "", callbackNote: "morgen", summary: "Zoekt personeel." });

beforeEach(() => {
  chat.mockResolvedValue({ text: interested });
});
afterEach(() => vi.clearAllMocks());

describe("captureCallOutcome", () => {
  it("zet bij een uitgaand gesprek het nummer van de ander op de lead, niet ons eigen nummer", async () => {
    current = call();
    await captureCallOutcome("c1");
    const input = createLead.mock.calls[0]![0] as { contactPhone: string };
    expect(input.contactPhone).toBe(THEIRS);
  });

  it("gebruikt bij een inkomend gesprek het nummer van de beller", async () => {
    current = call({ direction: "inbound", fromNumber: THEIRS, toNumber: OURS, script: "inbound" });
    await captureCallOutcome("c1");
    const input = createLead.mock.calls[0]![0] as { contactPhone: string };
    expect(input.contactPhone).toBe(THEIRS);
  });

  it("plant een vervolgactie op een nieuwe lead", async () => {
    current = call();
    await captureCallOutcome("c1");
    const arg = leadUpdate.mock.calls[0]![0] as { where: { id: string }; data: { nextActionAt: Date } };
    expect(arg.where.id).toBe("lead-new");
    expect(arg.data.nextActionAt).toBeInstanceOf(Date);
  });

  it("waarschuwt de eigenaar met naam, wens en het juiste nummer", async () => {
    current = call();
    await captureCallOutcome("c1");
    const alert = alertOwner.mock.calls[0]![0] as { key: string; title: string; detail: string };
    expect(alert.key).toBe("call-followup:c1");
    expect(alert.title).toContain("Marit");
    expect(alert.detail).toContain("morgen");
    expect(alert.detail).toContain(THEIRS);
    expect(alert.detail).not.toContain(OURS);
  });

  it("werkt een bestaande lead bij in plaats van een nieuwe te maken", async () => {
    current = call({ leadId: "lead-1" });
    await captureCallOutcome("c1");
    expect(createLead).not.toHaveBeenCalled();
    const arg = leadUpdate.mock.calls[0]![0] as { data: { notes: string; contactName: string } };
    expect(arg.data.notes).toContain("oud");
    expect(arg.data.notes).toContain("Zoekt personeel.");
    expect(arg.data.contactName).toBe("Marit");
    expect(alertOwner).toHaveBeenCalledOnce();
  });

  it("maakt geen lead en geen melding zonder interesse", async () => {
    chat.mockResolvedValue({ text: JSON.stringify({ interested: false, kind: "anders", summary: "Geen interesse." }) });
    current = call();
    await captureCallOutcome("c1");
    expect(createLead).not.toHaveBeenCalled();
    expect(alertOwner).not.toHaveBeenCalled();
  });

  it("slaat gesprekken over waarin de beller nauwelijks iets zei", async () => {
    current = call({ transcript: [{ at: "t", who: "ai", text: "opening" }, { at: "t", who: "beller", text: "Hallo" }] });
    await captureCallOutcome("c1");
    expect(chat).not.toHaveBeenCalled();
  });

  it("doet niets als de uitkomst al is vastgelegd", async () => {
    current = call({ outcome: { interested: true, kind: "werkgever", summary: "Al gedaan." } });
    await captureCallOutcome("c1");
    expect(chat).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
  });
});
