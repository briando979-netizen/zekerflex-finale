import { afterEach, describe, expect, it, vi } from "vitest";
import { postOpsWebhook } from "@/lib/ops/alert";

afterEach(() => vi.unstubAllGlobals());

describe("postOpsWebhook", () => {
  it("doet niets zonder URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await postOpsWebhook(undefined, "hallo")).toBe(false);
    expect(await postOpsWebhook("   ", "hallo")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST naar de webhook met content + text (Discord/Slack-compatibel)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    expect(await postOpsWebhook("https://discord.example/webhook", "🚨 kapot")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://discord.example/webhook");
    const body = JSON.parse(String(call[1]?.body)) as unknown;
    expect(body).toEqual({ content: "🚨 kapot", text: "🚨 kapot" });
  });

  it("faalt stil bij een netwerkfout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    expect(await postOpsWebhook("https://x", "y")).toBe(false);
  });

  it("geeft false bij een niet-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
    expect(await postOpsWebhook("https://x", "y")).toBe(false);
  });
});
