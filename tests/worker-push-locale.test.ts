import { beforeEach, describe, expect, it, vi } from "vitest";

// Pushes aan werkers in hun eigen app-taal: de taal staat in KV
// (werker-taal:<uid>, gezet bij het kiezen van een taal) en de ontvangers
// worden per taal gegroepeerd. Zonder opgeslagen keuze: Nederlands.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      findMany: async (args: { where: { key: { in: string[] } } }) =>
        args.where.key.in.filter((k) => h.kv.has(k)).map((k) => ({ key: k, value: h.kv.get(k) })),
      findUnique: async (args: { where: { key: string } }) => (h.kv.has(args.where.key) ? { key: args.where.key, value: h.kv.get(args.where.key) } : null),
      upsert: async (args: { where: { key: string }; create: { value: unknown } }) => void h.kv.set(args.where.key, args.create.value),
    },
  },
}));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), ids.length),
}));

import { setUserLocale, userLocale } from "@/lib/i18n/worker-locale";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { approvedPushText } from "@/lib/notifications/approved-push";
import { WORKER_PUSH, pushWhen } from "@/lib/i18n/worker-push";
import { LOCALES } from "@/lib/i18n/config";

beforeEach(() => {
  h.kv.clear();
  h.pushes.length = 0;
});

describe("werker-taal", () => {
  it("onthoudt de gekozen taal en valt terug op Nederlands", async () => {
    expect(await userLocale("u1")).toBe("nl");
    await setUserLocale("u1", "pl");
    expect(await userLocale("u1")).toBe("pl");
  });
});

describe("sendLocalizedPush", () => {
  it("groepeert per taal en bouwt per taal het bericht", async () => {
    await setUserLocale("u-pl", "pl");
    await setUserLocale("u-uk", "uk");
    const n = await sendLocalizedPush(["u-nl", "u-pl", "u-uk", "u-pl"], (t, locale) => ({
      title: t.cancelledTitle("Magazijn"),
      body: t.cancelledBody(pushWhen(locale, { startsAt: new Date("2026-11-05T08:00:00Z"), endsAt: new Date("2026-11-05T16:00:00Z") })),
      data: {},
      ttlSeconds: 60,
    }));
    expect(n).toBe(3);
    const byTitle = Object.fromEntries(h.pushes.map((p) => [p.ids.join(","), p.push]));
    expect(byTitle["u-nl"]?.title).toBe("Geannuleerd: Magazijn");
    expect(byTitle["u-pl"]?.title).toBe("Odwołano: Magazijn");
    expect(byTitle["u-pl"]?.body).toContain("cz 5 lis 09:00–17:00");
    expect(byTitle["u-uk"]?.body).toContain("чт 5 лист 09:00–17:00");
  });
});

describe("approvedPushText in de taal van de werker", () => {
  const r = { timesheetId: "ts1", billableMinutes: 450, track: "invoice" as const, payout: { amountCents: 13500 }, payroll: null, advance: null };

  it("Nederlands blijft gelijk, Pools en Engels zijn vertaald", () => {
    expect(approvedPushText(r, "Magazijn").body).toBe("Magazijn: 7,5 uur. € 135,00 is onderweg naar je rekening.");
    expect(approvedPushText(r, "Magazijn", WORKER_PUSH.pl).title).toBe("✅ Twoje godziny zostały zatwierdzone");
    expect(approvedPushText(r, "Magazijn", WORKER_PUSH.en).body).toBe("Magazijn: 7,5 hours. € 135,00 is on its way to your account.");
  });

  it("heeft in elke taal alle teksten", () => {
    for (const l of LOCALES) {
      const t = WORKER_PUSH[l];
      expect(t.approvedTitle.length).toBeGreaterThan(5);
      expect(t.timeChangedBody("X")).toContain("X");
      expect(t.approvedAdvance("A", "W")).toContain("A");
    }
  });
});
