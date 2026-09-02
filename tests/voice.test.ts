import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    voiceAnnouncement: {
      create: (...a: unknown[]) => create(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));
vi.mock("@/lib/ai/client", () => ({
  chat: vi.fn().mockResolvedValue({ text: "Herschreven zin.", model: "x", raw: {} }),
}));

import {
  announce,
  markSpoken,
  pendingAnnouncements,
  voiceCapabilities,
} from "@/lib/voice/announce";
import { isServerTtsEnabled } from "@/lib/voice/tts";

afterEach(() => vi.clearAllMocks());

describe("voice announce", () => {
  it("stores an announcement", async () => {
    create.mockResolvedValue({ id: "a1", text: "Build is groen.", category: "build", priority: "NORMAL" });
    const row = await announce({ text: "Build is groen.", category: "build" });
    expect(row?.id).toBe("a1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: "Build is groen.", category: "build" }),
      }),
    );
  });

  it("rephrases when asked", async () => {
    create.mockResolvedValue({ id: "a2" });
    await announce({ text: "cyclus klaar met 3 bevindingen", category: "orchestration", rephrase: true });
    const data = create.mock.calls[0]![0].data;
    expect(data.text).toBe("Herschreven zin.");
  });

  it("orders pending by priority then age", async () => {
    findMany.mockResolvedValue([]);
    await pendingAnnouncements();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spokenAt: null },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      }),
    );
  });

  it("markSpoken is a no-op for an empty list", async () => {
    await markSpoken([]);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("server TTS", () => {
  it("is disabled without Piper configured", () => {
    expect(isServerTtsEnabled()).toBe(false);
    expect(voiceCapabilities().serverTts).toBe(false);
    expect(voiceCapabilities().enabled).toBe(true);
  });
});
