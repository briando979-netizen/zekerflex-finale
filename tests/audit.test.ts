import { describe, expect, it } from "vitest";
import { auditContext } from "@/lib/audit";

const withHeaders = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe("auditContext", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const ctx = auditContext(
      withHeaders({
        "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
        "user-agent": "ZekerFlexApp/1.2 (iOS)",
      }),
    );
    expect(ctx.ipAddress).toBe("203.0.113.7");
    expect(ctx.userAgent).toBe("ZekerFlexApp/1.2 (iOS)");
  });

  it("falls back to x-real-ip", () => {
    const ctx = auditContext(withHeaders({ "x-real-ip": "198.51.100.9" }));
    expect(ctx.ipAddress).toBe("198.51.100.9");
    expect(ctx.userAgent).toBeNull();
  });

  it("returns nulls when nothing is present", () => {
    const ctx = auditContext(withHeaders({}));
    expect(ctx).toEqual({ ipAddress: null, userAgent: null });
  });
});
