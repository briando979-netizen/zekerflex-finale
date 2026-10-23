import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@prisma/client", () => ({ InvoiceStatus: { ISSUED: "ISSUED", PAID: "PAID" }, VatTreatment: { REVERSE_CHARGE: "REVERSE_CHARGE" } }));
vi.mock("@/lib/env", () => ({ env: { ICP_ENDPOINT: undefined, ICP_TOKEN: undefined } }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildIcpOpgave, deliverIcpOpgave, previousQuarter, quarterLabel } from "@/lib/billing/icp";

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("quarter helpers", () => {
  it("formats and finds the previous quarter", () => {
    expect(quarterLabel("2026-Q3")).toBe("Q3 2026");
    expect(previousQuarter(new Date("2026-10-15T00:00:00Z"))).toBe("2026-Q3"); // Oct is Q4 → prev Q3
    expect(previousQuarter(new Date("2026-01-15T00:00:00Z"))).toBe("2025-Q4");
  });
});

describe("buildIcpOpgave", () => {
  it("groups reverse-charge invoices by customer VAT-id and sums the net", async () => {
    findMany.mockResolvedValue([
      { subtotalCents: 100000, recipientTenant: { name: "Belgische BV", country: "BE", vatNumber: "BE0123456789" } },
      { subtotalCents: 50000, recipientTenant: { name: "Belgische BV", country: "BE", vatNumber: "BE0123456789" } },
      { subtotalCents: 30000, recipientTenant: { name: "Duitse GmbH", country: "DE", vatNumber: "DE123456789" } },
    ]);
    const o = await buildIcpOpgave("2026-Q3");
    expect(o.lines).toHaveLength(2);
    const be = o.lines.find((l) => l.vatId === "BE0123456789")!;
    expect(be.nettoCents).toBe(150000);
    expect(be.facturen).toBe(2);
    expect(o.totals.nettoCents).toBe(180000);
    expect(o.totals.incompleet).toBe(0);
  });

  it("flags a customer without a VAT-id as incomplete", async () => {
    findMany.mockResolvedValue([{ subtotalCents: 20000, recipientTenant: { name: "Geen BTW BV", country: "BE", vatNumber: null } }]);
    const o = await buildIcpOpgave("2026-Q3");
    expect(o.lines[0]!.compleet).toBe(false);
    expect(o.totals.incompleet).toBe(1);
  });

  it("rejects an invalid period format", async () => {
    await expect(buildIcpOpgave("2026-10")).rejects.toThrow(/tijdvak/i);
  });
});

describe("deliverIcpOpgave", () => {
  it("refuses delivery when a line misses a VAT-id", async () => {
    findMany.mockResolvedValue([{ subtotalCents: 20000, recipientTenant: { name: "X", country: "BE", vatNumber: null } }]);
    const r = await deliverIcpOpgave("2026-Q3");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/btw-id/i);
  });

  it("falls back to export when complete but no channel configured", async () => {
    findMany.mockResolvedValue([{ subtotalCents: 20000, recipientTenant: { name: "OK BV", country: "BE", vatNumber: "BE0123456789" } }]);
    const r = await deliverIcpOpgave("2026-Q3");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/leverkanaal/i);
  });
});
