import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// lib/kyc/vision.ts — the vision half of KYC review that was entirely missing
// (the text-only checker never looked at the photo content). These tests
// pin down the contract that lib/onboarding/verify.ts relies on: available
// only when LLM_VISION_MODEL is set, NEVER throws, and a flaky/unavailable
// model degrades to "unavailable" rather than blocking anything.
// ---------------------------------------------------------------------------

const envMock = vi.hoisted(() => ({ LLM_VISION_MODEL: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ env: envMock }));

const chatJson = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  chatJson: (...a: unknown[]) => chatJson(...a),
  imageDataUrl: (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString("base64")}`,
}));

import { isVisionReviewEnabled, runVisionReview } from "@/lib/kyc/vision";

const IMG = { bytes: Buffer.from("fake-bytes"), mimeType: "image/jpeg" };

beforeEach(() => {
  envMock.LLM_VISION_MODEL = undefined;
});
afterEach(() => vi.clearAllMocks());

describe("isVisionReviewEnabled", () => {
  it("is false with no model configured, true once one is set", () => {
    expect(isVisionReviewEnabled()).toBe(false);
    envMock.LLM_VISION_MODEL = "moondream";
    expect(isVisionReviewEnabled()).toBe(true);
  });
});

describe("runVisionReview — no model configured", () => {
  it("returns unavailable without ever calling the model", async () => {
    const result = await runVisionReview({ front: IMG, back: IMG, selfie: IMG });
    expect(result).toEqual({ available: false, document: null, face: null, model: null });
    expect(chatJson).not.toHaveBeenCalled();
  });
});

describe("runVisionReview — model configured", () => {
  beforeEach(() => {
    envMock.LLM_VISION_MODEL = "moondream";
  });

  it("parses a clean approval from both calls", async () => {
    chatJson
      .mockResolvedValueOnce({ plausible: true, confidence: 0.9, document_number: "SPECI2014", expiry_date: "2031-01-01", concerns: [] })
      .mockResolvedValueOnce({ same_person: true, face_match_confidence: 0.88, looks_live: true, liveness_confidence: 0.8, concerns: [] });

    const result = await runVisionReview({ front: IMG, back: IMG, selfie: IMG });

    expect(result.available).toBe(true);
    expect(result.model).toBe("moondream");
    expect(result.document).toMatchObject({ plausible: true, documentNumber: "SPECI2014", expiryDate: "2031-01-01" });
    expect(result.face).toMatchObject({ samePerson: true, faceMatchConfidence: 0.88, looksLive: true });
    // Both calls used the configured model and included both images.
    for (const call of chatJson.mock.calls) {
      expect((call[0] as { model: string }).model).toBe("moondream");
    }
  });

  it("clamps out-of-range confidences instead of trusting the model blindly", async () => {
    chatJson
      .mockResolvedValueOnce({ plausible: true, confidence: 5, concerns: [] })
      .mockResolvedValueOnce({ same_person: true, face_match_confidence: -1, looks_live: true, liveness_confidence: 1.4, concerns: [] });

    const result = await runVisionReview({ front: IMG, back: IMG, selfie: IMG });
    expect(result.document!.confidence).toBe(1);
    expect(result.face!.faceMatchConfidence).toBe(0);
    expect(result.face!.livenessConfidence).toBe(1);
  });

  it("ignores an unparseable expiry date rather than passing junk through", async () => {
    chatJson
      .mockResolvedValueOnce({ plausible: true, confidence: 0.8, expiry_date: "volgend jaar", concerns: [] })
      .mockResolvedValueOnce({ same_person: true, face_match_confidence: 0.8, looks_live: true, liveness_confidence: 0.8, concerns: [] });

    const result = await runVisionReview({ front: IMG, back: IMG, selfie: IMG });
    expect(result.document!.expiryDate).toBeNull();
  });

  it("degrades to unavailable (never throws) when the model call fails", async () => {
    chatJson.mockRejectedValue(new Error("model niet geladen"));
    const result = await runVisionReview({ front: IMG, back: IMG, selfie: IMG });
    expect(result.available).toBe(false);
    expect(result.document).toBeNull();
    expect(result.face).toBeNull();
    expect(result.error).toMatch(/model niet geladen/);
  });

  it("degrades to unavailable when the model reply can't be parsed as JSON", async () => {
    chatJson.mockRejectedValue(new Error("LLM did not return JSON"));
    const result = await runVisionReview({ front: IMG, back: IMG, selfie: IMG });
    expect(result.available).toBe(false);
  });
});
