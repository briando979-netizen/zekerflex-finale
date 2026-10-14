import { afterEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
vi.mock("@/lib/ai/client", () => ({ chatJson: (...a: unknown[]) => chatJson(...a) }));

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

  it("rejects a malformed model response instead of silently accepting it", async () => {
    chatJson.mockResolvedValue({ headline: "x" }); // missing required fields
    await expect(generateAdCopy({ audience: "freelancer" })).rejects.toBeTruthy();
  });
});
