import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// logger.forRequest() is the correlation-id primitive: every log line for one
// request should carry the same id, whether it came from middleware.ts (set
// via the x-correlation-id header) or was generated here as a fallback.
// ---------------------------------------------------------------------------

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  logSpy.mockRestore();
});

function lastLogLine(): Record<string, unknown> {
  const call = logSpy.mock.calls.at(-1);
  return JSON.parse(call![0] as string);
}

describe("logger.forRequest", () => {
  it("reuses the correlation id middleware attached to the request", () => {
    const request = new Request("http://x/api/whatever", {
      headers: { "x-correlation-id": "cid-from-middleware" },
    });
    logger.forRequest(request).info("hello");
    expect(lastLogLine().correlationId).toBe("cid-from-middleware");
  });

  it("generates a fallback id when the request has none", () => {
    const request = new Request("http://x/api/whatever");
    logger.forRequest(request).info("hello");
    const line = lastLogLine();
    expect(typeof line.correlationId).toBe("string");
    expect((line.correlationId as string).length).toBeGreaterThan(10);
  });

  it("merges extra bound fields alongside the correlation id", () => {
    const request = new Request("http://x/", { headers: { "x-correlation-id": "cid-1" } });
    logger.forRequest(request, { route: "POST /api/example" }).info("careful");
    const line = lastLogLine();
    expect(line.correlationId).toBe("cid-1");
    expect(line.route).toBe("POST /api/example");
  });

  it("every subsequent call on the same bound logger keeps the same id", () => {
    const request = new Request("http://x/", { headers: { "x-correlation-id": "cid-2" } });
    const log = logger.forRequest(request);
    log.info("first");
    log.info("second");
    expect(lastLogLine().correlationId).toBe("cid-2");
    expect(lastLogLine().message).toBe("second");
  });
});
