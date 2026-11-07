import { describe, expect, it, vi } from "vitest";

// ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN = false): geen tegoed, geen
// pas, geen bonus via de bank. Verdiensten gaan altijd naar de eigen IBAN.

const kv = new Map<string, unknown>([["bank-payout-pref:u1", "bank"]]);
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvFindByField: async () => [],
}));
const transfer = vi.fn();
vi.mock("@/lib/bank/ledger", () => ({ transfer: (...a: unknown[]) => transfer(...a), book: vi.fn() }));
vi.mock("@/lib/bank/accounts", () => ({ platformAccount: vi.fn(), personalAccount: vi.fn() }));
vi.mock("@/lib/bank/notify", () => ({ notifyBank: vi.fn(), notifyIncoming: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { BANK_AAN, isBankPath } from "@/lib/app-mode";
import { getPayoutDestination } from "@/lib/bank/earnings";
import { rewardReferral } from "@/lib/rewards/referral";
import { alleApps } from "@/lib/os/apps";

describe("ZekerFlex Bank staat uit", () => {
  it("de schakelaar staat uit", () => {
    expect(BANK_AAN).toBe(false);
  });

  it("de schermen en API's van de bank zijn dicht, je rekening bevestigen niet", () => {
    for (const p of ["/dashboard/bank", "/werkgever/bank", "/werkgever/bank/kaarten", "/betaalverzoek/abc", "/api/me/bank", "/api/me/bank/topup", "/api/betaal/verzoek/abc"]) {
      expect(isBankPath(p), p).toBe(true);
    }
    for (const p of ["/api/me/bank-verify", "/dashboard", "/dashboard/bankrekening", "/admin/bank", "/api/admin/bank"]) {
      expect(isBankPath(p), p).toBe(false);
    }
  });

  it("verdiensten gaan naar de eigen IBAN, ook wie eerder de bank koos", async () => {
    expect(await getPayoutDestination("u1")).toBe("iban");
  });

  it("geen doorverwijsbonus op een bank die er niet is", async () => {
    kv.set("ref-by:nieuw", { referrerId: "oud", newUserId: "nieuw", at: "2026-11-01T10:00:00.000Z" });
    expect(await rewardReferral("nieuw", null)).toBe(false);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("ZekerFlex OS toont geen bank-apps", () => {
    const ids = alleApps().map((a) => a.id);
    expect(ids).not.toContain("w-bank");
    expect(ids).not.toContain("b-bank");
  });
});
