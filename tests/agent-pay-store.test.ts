import { describe, expect, it, vi } from "vitest";

// Mock KV zodat het importeren van de store geen echte Redis/KV aanraakt.
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));

import { spentTodayCents } from "@/lib/agent-pay/store";
import { restockUnitCents } from "@/lib/agent-pay/propose-ai";
import { runRail } from "@/lib/agent-pay/rail";
import type { PaymentIntent } from "@/lib/agent-pay/intents";

const mk = (over: Partial<PaymentIntent>): PaymentIntent => ({
  id: "x",
  amountCents: 1000,
  currency: "EUR",
  recipient: "r",
  external: false,
  reason: "r",
  proposedBy: "ai",
  status: "PENDING",
  createdAt: "2026-10-29T10:00:00.000Z",
  ...over,
});

describe("spentTodayCents", () => {
  it("telt alleen betalingen die VANDAAG zijn uitgevoerd", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const intents: PaymentIntent[] = [
      mk({ status: "EXECUTED", amountCents: 5000, decidedAt: "2026-10-29T09:00:00.000Z" }),
      mk({ status: "EXECUTED", amountCents: 3000, decidedAt: "2026-10-28T09:00:00.000Z" }), // gisteren
      mk({ status: "APPROVED", amountCents: 9999, decidedAt: "2026-10-29T09:00:00.000Z" }), // niet uitgevoerd
    ];
    expect(spentTodayCents(intents, now)).toBe(5000);
  });
});

describe("restockUnitCents", () => {
  it("gebruikt de COGS als die er is, anders de halve verkoopprijs", () => {
    expect(restockUnitCents(800, 2000)).toBe(800);
    expect(restockUnitCents(null, 2000)).toBe(1000);
    expect(restockUnitCents(0, 2000)).toBe(1000);
  });
});

describe("runRail (standaard uit)", () => {
  it("verplaatst geen echt geld zonder aangesloten rail", async () => {
    const r = await runRail(mk({ status: "APPROVED" }));
    expect(r.executed).toBe(false);
    expect(r.detail).toMatch(/geen betaalrail|handmatig/i);
  });
});
