import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/client-error/route";
import { logger } from "@/lib/logger";
import { isStaleDeployment } from "@/lib/ops/stale-deployment";

// Exactly what Next 15.5 throws when the new build no longer has the action an open tab calls
// (next/dist/client/components/router-reducer/reducers/server-action-reducer.js). The old
// pattern missed it, so the self-reload never ran and /login showed the error page.
const NEXT15 = 'Server Action "7f3a9c0e1b2d4e5f" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action';

describe("isStaleDeployment", () => {
  it("recognises the Next 15 unknown-action error, with or without its class name", () => {
    expect(isStaleDeployment({ name: "UnrecognizedActionError", message: NEXT15 })).toBe(true);
    expect(isStaleDeployment({ message: NEXT15 })).toBe(true);
  });

  it("still recognises the older action message and missing chunks", () => {
    for (const message of [
      'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
      "Loading chunk 123 failed.",
      "Loading CSS chunk 45 failed.",
    ]) {
      expect(isStaleDeployment({ message })).toBe(true);
    }
    expect(isStaleDeployment({ name: "ChunkLoadError", message: "" })).toBe(true);
  });

  it("leaves real errors alone", () => {
    for (const message of ["Cannot read properties of undefined (reading 'map')", "Failed to fetch", "Server Action failed: geen toegang", "Not found"]) {
      expect(isStaleDeployment({ message })).toBe(false);
    }
    expect(isStaleDeployment(null)).toBe(false);
    expect(isStaleDeployment(undefined)).toBe(false);
  });
});

describe("POST /api/client-error", () => {
  afterEach(() => vi.clearAllMocks());

  const post = (body: unknown) =>
    POST(new Request("http://localhost/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("logs a tab left open during a deploy as a warning, under the same message", async () => {
    const res = await post({ message: NEXT15, url: "https://zekerflex.com/login" });
    expect(res.status).toBe(200);
    // same message as a real crash, so the Bouwer button stays off for this public endpoint
    expect(logger.warn).toHaveBeenCalledWith("client error boundary", expect.objectContaining({ url: "https://zekerflex.com/login", clientMessage: NEXT15 }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("keeps a real client crash at error level", async () => {
    await post({ message: "Cannot read properties of undefined (reading 'map')", url: "https://zekerflex.com/dashboard" });
    expect(logger.error).toHaveBeenCalledWith("client error boundary", expect.objectContaining({ clientMessage: "Cannot read properties of undefined (reading 'map')" }));
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
