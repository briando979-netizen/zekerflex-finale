import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";

describe("toErrorBody", () => {
  it("maps an AppError to its status + code", () => {
    const { status, body } = toErrorBody(AppError.forbidden("nope"));
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("maps a ZodError to 422 VALIDATION_FAILED", () => {
    const parsed = z.object({ n: z.number().min(10) }).safeParse({ n: 1 });
    expect(parsed.success).toBe(false);
    const { status, body } = toErrorBody((parsed as { error: unknown }).error);
    expect(status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("maps anything else to 500", () => {
    expect(toErrorBody(new Error("boom")).status).toBe(500);
  });
});
