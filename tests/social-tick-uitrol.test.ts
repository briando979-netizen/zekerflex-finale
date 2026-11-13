import { afterEach, describe, expect, it, vi } from "vitest";

const heartbeat = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/ops/heartbeat", () => ({ recordCronHeartbeat: (...a: unknown[]) => heartbeat(...a) }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: () => ({ ok: true }) }));
const socialTick = vi.fn(async () => ({ geplaatst: 0 }));
vi.mock("@/lib/social/publiceer", () => ({ socialTick: () => socialTick() }));
let status: unknown = null;
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => status }));

import { GET } from "@/app/api/internal/social/tick/route";

afterEach(() => {
  vi.clearAllMocks();
  status = null;
});

describe("social/tick tijdens een uitrol", () => {
  it("slaat de tik over maar schrijft wel een geslaagde hartslag (geen vals alarm na twee uur)", async () => {
    status = { staat: "bezig", bijgewerkt: new Date().toISOString() };
    const res = await GET(new Request("http://app/api/internal/social/tick"));
    expect(await res.json()).toMatchObject({ overgeslagen: "uitrol bezig" });
    expect(socialTick).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledWith("social-tick", true);
  });

  it("draait gewoon als er geen uitrol bezig is", async () => {
    const res = await GET(new Request("http://app/api/internal/social/tick"));
    expect(res.status).toBe(200);
    expect(socialTick).toHaveBeenCalledTimes(1);
    expect(heartbeat).toHaveBeenCalledWith("social-tick", true);
  });
});
