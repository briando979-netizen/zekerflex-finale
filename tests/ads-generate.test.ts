import { afterEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
const configProblem = vi.fn(() => null as string | null);
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined, chatJson: (...a: unknown[]) => chatJson(...a), llmConfigProblem: () => configProblem() }));

import { generateAdCopy } from "@/lib/ads/generate";

afterEach(() => vi.clearAllMocks());

const VALID = { headline: "Zeker van je werk", subheadline: "Flexwerk dat bij je past", body: "Kies zelf hoe snel je wordt uitbetaald.", cta: "Meld je gratis aan" };

describe("generateAdCopy", () => {
  it("returns the parsed copy when the model responds with valid JSON", async () => {
    chatJson.mockResolvedValue(VALID);
    const copy = await generateAdCopy({ audience: "freelancer" });
    expect(copy).toEqual(VALID);
  });

  it("includes the fixed facts and forbids inventing numbers in the system prompt", async () => {
    chatJson.mockResolvedValue(VALID);
    await generateAdCopy({ audience: "werkgever" });
    const call = chatJson.mock.calls[0]![0];
    const systemMessage = call.messages.find((m: { role: string }) => m.role === "system").content as string;
    expect(systemMessage).toContain("€ 3,50");
    expect(systemMessage).toMatch(/verzin geen/i);
  });

  it("passes the angle as a user message when given", async () => {
    chatJson.mockResolvedValue(VALID);
    await generateAdCopy({ audience: "freelancer", angle: "zelfde dag uitbetaald" });
    const call = chatJson.mock.calls[0]![0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(userMessage).toContain("zelfde dag uitbetaald");
  });

  it("never passes a malformed model response through — falls back to a checked template", async () => {
    chatJson.mockResolvedValue({ headline: "x" }); // missing required fields
    const copy = await generateAdCopy({ audience: "freelancer" });
    expect(copy.headline).not.toBe("x");
    expect(copy.body.length).toBeGreaterThan(10);
    expect(copy.cta).toBeTruthy();
  });

  it("falls back to fact-checked templates when no model is connected", async () => {
    configProblem.mockReturnValueOnce("geen model");
    const copy = await generateAdCopy({ audience: "werkgever", angle: "korting" });
    expect(copy.headline).toContain("goedkoper");
    expect(chatJson).not.toHaveBeenCalled();
  });
});
