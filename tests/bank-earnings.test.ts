import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const book = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/kv", () => ({
  kvFindByField: async (prefix: string, field: string, eq: string) =>
    [...kv.entries()].filter(([k, v]) => k.startsWith(prefix) && (v as Record<string, unknown>)?.[field] === eq).map(([, v]) => v),
  kvFindDue: async (prefix: string, field: string, before: string, after = "") =>
    [...kv.entries()]
      .filter(([k, v]) => k.startsWith(prefix) && k > after && String((v as Record<string, unknown>)?.[field] ?? "~") <= before)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => ({ key, value })),
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));
vi.mock("@/lib/bank/accounts", () => ({ personalAccount: async () => ({ id: "acc1", number: "ZF0000000001" }) }));
vi.mock("@/lib/bank/ledger", () => ({ book: (...a: unknown[]) => book(...a) }));

import { creditEarning, getPayoutDestination, setPayoutDestination } from "@/lib/bank/earnings";

beforeEach(() => {
  kv.clear();
  book.mockReset().mockResolvedValue({ id: "e1", created: true });
});

describe("earnings on ZekerFlex Bank", () => {
  it("defaults to the IBAN until the freelancer opts in", async () => {
    expect(await getPayoutDestination("u1")).toBe("iban");
    await setPayoutDestination("u1", "bank");
    expect(await getPayoutDestination("u1")).toBe("bank");
  });

  it("books an EARNING keyed on the invoice, so a retried approval credits once", async () => {
    const r = await creditEarning({
      userId: "u1",
      holderName: "Liam Gold",
      amountCents: 14_250,
      description: "Verdiensten F-2026-001",
      counterparty: "Supermarktketen",
      reference: "F-2026-001",
      idempotencyKey: "earning:inv1",
    });
    expect(r.accountNumber).toBe("ZF0000000001");
    expect(book).toHaveBeenCalledWith("acc1", expect.objectContaining({ amountCents: 14_250, kind: "EARNING", idempotencyKey: "earning:inv1" }), { allowFrozen: true });
  });
});
