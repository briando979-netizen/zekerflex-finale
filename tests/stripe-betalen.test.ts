import { afterEach, describe, expect, it, vi } from "vitest";

// Het live Stripe-account ontvangt geen betalingen meer (11 nov 2026, 17:30 UTC): herkennen, de bankcontrole laten
// terugvallen, en de eigenaar één keer per omslag waarschuwen (lib/billing/stripe-betalen.ts).

const kv = vi.hoisted(() => new Map<string, unknown>());
const alert = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => alert(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({ accounts: { retrieveCurrent: async () => ({ charges_enabled: false, payouts_enabled: false }) } }) }));

import { isBetalenUitFout, leesStand, nieuweStand, slaatOmNaarUit } from "@/lib/billing/stripe-betalen-stand";
import { ACCOUNT_STAND_KEY, BETALEN_UIT_KEY, betalenUit, meetStripeAccount, verwerkAccountStand, zetBetalenUit } from "@/lib/billing/stripe-betalen";

afterEach(() => {
  kv.clear();
  vi.clearAllMocks();
});

describe("herkennen", () => {
  it("de melding van Stripe bij een dichtgezet account, niet een gewone storing", () => {
    expect(isBetalenUitFout(new Error("Your account cannot currently make live charges."))).toBe(true);
    expect(isBetalenUitFout({ raw: { message: "Your account cannot currently make live charges." } })).toBe(true);
    expect(isBetalenUitFout(new Error("connect ETIMEDOUT"))).toBe(false);
    expect(isBetalenUitFout(null)).toBe(false);
  });

  it("de stand onthoudt sinds wanneer het uit staat, en slaat alleen bij een echte omslag om", () => {
    const t1 = new Date("2026-11-11T17:31:05Z");
    const t2 = new Date("2026-11-11T18:00:00Z");
    const uit = nieuweStand(null, false, false, t1);
    expect(uit.uitSinds).toBe(t1.toISOString());
    expect(slaatOmNaarUit(null, uit)).toBe(true);
    const nogUit = nieuweStand(uit, false, false, t2);
    expect(nogUit.uitSinds).toBe(t1.toISOString());
    expect(slaatOmNaarUit(uit, nogUit)).toBe(false);
    expect(nieuweStand(nogUit, true, true, t2).uitSinds).toBeNull();
    expect(leesStand({ betalen: "ja" })).toBeNull();
  });
});

describe("verwerken", () => {
  it("bij het omslaan naar uit: één critical melding, de vlag aan, en geen tweede melding bij het volgende event", async () => {
    await verwerkAccountStand(false, false, "event-evt_1", new Date("2026-11-11T17:31:05Z"));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[0]).toMatchObject({ key: "stripe-betalen-uit:event-evt_1", severity: "critical" });
    expect(String((alert.mock.calls[0]?.[0] as { title: string }).title)).toMatch(/Stripe heeft betalingen uitgezet/);
    expect(await betalenUit(Date.parse("2026-11-11T17:40:00Z"))).not.toBeNull();
    await verwerkAccountStand(false, false, "event-evt_2", new Date("2026-11-11T18:46:00Z"));
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("weer aan: de vlag gaat weg en de stand staat goed", async () => {
    await verwerkAccountStand(false, true, "a", new Date("2026-11-11T17:31:05Z"));
    await verwerkAccountStand(true, true, "b", new Date("2026-11-12T09:00:00Z"));
    expect(kv.has(BETALEN_UIT_KEY)).toBe(false);
    expect(leesStand(kv.get(ACCOUNT_STAND_KEY))).toMatchObject({ betalen: true, uitbetalen: true, uitSinds: null });
  });

  it("de vlag geldt een uur, en het logboek krijgt één waarschuwing zolang hij aan staat", async () => {
    const nu = Date.parse("2026-11-12T04:31:00Z");
    await zetBetalenUit("Your account cannot currently make live charges.", nu);
    await zetBetalenUit("Your account cannot currently make live charges.", nu + 60_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await betalenUit(nu + 30 * 60_000)).not.toBeNull();
    expect(await betalenUit(nu + 2 * 60 * 60_000)).toBeNull();
  });

  it("de meting (cron) vraagt het eigen account op en verwerkt de stand", async () => {
    const stand = await meetStripeAccount(new Date("2026-11-12T05:00:00Z"));
    expect(stand).toMatchObject({ betalen: false, uitbetalen: false });
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
