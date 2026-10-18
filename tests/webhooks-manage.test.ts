import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/webhooks/crypto", () => ({ encryptWebhookSecret: (s: string) => s, decryptWebhookSecret: (s: string) => s }));

import { assertSafeWebhookUrl } from "@/lib/webhooks/manage";

describe("webhook URL safety (SSRF)", () => {
  it("accepts public https endpoints", () => {
    expect(assertSafeWebhookUrl("https://hooks.voorbeeld.nl/zf")).toBe("https://hooks.voorbeeld.nl/zf");
  });

  it.each([
    "http://hooks.voorbeeld.nl/zf",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://192.168.1.10/x",
    "https://172.20.0.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://printer.local/x",
    "https://user:pass@hooks.voorbeeld.nl/",
    "geen-url",
  ])("rejects %s", (u) => {
    expect(() => assertSafeWebhookUrl(u)).toThrow();
  });
});
