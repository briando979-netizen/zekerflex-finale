import { afterEach, describe, expect, it, vi } from "vitest";

// draftOutreach praat met de eigen LLM via lib/ai/client.chat. We mocken die:
// bij een goed antwoord gebruiken we dat; bij een fout/leeg antwoord valt het
// terug op een sjabloon — zodat een uitgevallen AI-node de recruiter niet breekt.
const chat = vi.fn();
vi.mock("@/lib/ai/client", () => ({ chat: (...a: unknown[]) => chat(...a) }));

import { draftOutreach, fallbackDraft, type DraftContext } from "@/lib/recruiter/draft";

const ctx: DraftContext = {
  candidateName: "Sanne de Vries",
  vacancyTitle: "Bediening evenement",
  city: "Utrecht",
  dateLabel: "donderdag 30 oktober",
  hourlyRate: "€ 18,50",
  channel: "whatsapp",
  highlights: ["Reistijd: 12 min", "Betrouwbaarheid: 95%"],
};

afterEach(() => vi.clearAllMocks());

describe("draftOutreach", () => {
  it("gebruikt het AI-antwoord en stript omringende aanhalingstekens", async () => {
    chat.mockResolvedValue({ text: '"Hoi Sanne, heb je donderdag zin in een klus in Utrecht?"', model: "m", raw: {} });
    const r = await draftOutreach(ctx);
    expect(r.aiUsed).toBe(true);
    expect(r.message).toBe("Hoi Sanne, heb je donderdag zin in een klus in Utrecht?");
  });

  it("geeft de kandidaat + feiten mee aan het model (geen verzinsels)", async () => {
    chat.mockResolvedValue({ text: "Hoi Sanne, ...", model: "m", raw: {} });
    await draftOutreach(ctx);
    const call = chat.mock.calls[0]![0] as { messages: { role: string; content: string }[] };
    const system = call.messages.find((m) => m.role === "system")!.content;
    const user = call.messages.find((m) => m.role === "user")!.content;
    expect(system).toMatch(/verzin niets/i);
    expect(user).toContain("Sanne de Vries");
    expect(user).toContain("Bediening evenement");
    expect(user).toContain("€ 18,50");
    expect(user).toContain("WhatsApp");
  });

  it("valt terug op een sjabloon als de AI gooit", async () => {
    chat.mockRejectedValue(new Error("node down"));
    const r = await draftOutreach(ctx);
    expect(r.aiUsed).toBe(false);
    expect(r.message).toContain("Sanne");
    expect(r.message).toContain("Utrecht");
  });

  it("valt terug op een sjabloon bij een te kort AI-antwoord", async () => {
    chat.mockResolvedValue({ text: "ok", model: "m", raw: {} });
    const r = await draftOutreach(ctx);
    expect(r.aiUsed).toBe(false);
    expect(r.message).toBe(fallbackDraft(ctx));
  });

  it("e-mail-sjabloon heeft een aanhef", () => {
    expect(fallbackDraft({ ...ctx, channel: "email" })).toMatch(/^Beste Sanne,/);
  });
});
