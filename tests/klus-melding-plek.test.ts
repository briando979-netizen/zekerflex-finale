import { beforeEach, describe, expect, it, vi } from "vitest";

// Meldingen aan werkers (10 nov): bij een klus op een los adres de bedrijfsnaam in plaats van
// "Eenmalige locatie — adres" (zoals op de kaarten), en het klusvoorstel in de app-taal van de
// werker (AGENTS.md) in plaats van altijd "Nieuwe shift: …" in het Nederlands.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), payloads: [] as string[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ userId: "u1" }) },
    webPushSubscription: {
      findMany: async () => [{ endpoint: "https://push.example/abc", p256dh: "p", authKey: "a" }],
      updateMany: async () => ({ count: 0 }),
    },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvGetMany: async (ks: string[]) => new Map(ks.filter((k) => h.kv.has(k)).map((k) => [k, h.kv.get(k)])),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/notifications/push/web-push", () => ({
  isWebPushEnabled: () => true,
  pushServiceOf: () => "push.example",
  sendWebPush: async (_s: unknown, payload: string) => (h.payloads.push(payload), { ok: true }),
}));
vi.mock("@/lib/notifications/push/apns", () => ({ isApnsEnabled: () => false, sendApnsToUsers: async () => 0 }));
vi.mock("@/lib/metrics", () => ({ recordShiftOffer: () => undefined }));

import { isEenmaligeLocatie, plekVoorWerker } from "@/lib/shifts/place-label";
import { WORKER_PUSH, pushRate } from "@/lib/i18n/worker-push";
import { LOCALES } from "@/lib/i18n/config";
import { sendShiftOffer } from "@/lib/notifications/push";

beforeEach(() => {
  h.kv.clear();
  h.payloads.length = 0;
});

describe("de plek in een melding", () => {
  it("een los adres wordt de bedrijfsnaam; een vestiging blijft een vestiging", () => {
    expect(isEenmaligeLocatie("Eenmalige locatie — Achterhoeksweg, Haarle")).toBe(true);
    expect(plekVoorWerker("Eenmalige locatie — Achterhoeksweg, Haarle", "Bakkerij De Vries")).toBe("Bakkerij De Vries");
    expect(plekVoorWerker("Albert Heijn Centrum", "Albert Heijn")).toBe("Albert Heijn Centrum");
    // zonder bedrijfsnaam blijft het (opgeschoonde) adres staan
    expect(plekVoorWerker("Eenmalige locatie — Utrecht, Utrecht, Utrecht", "  ")).toBe("Eenmalige locatie — Utrecht");
  });
});

describe("het klusvoorstel", () => {
  it("heeft in alle vijf talen een titel en een tekst met plek, stad, tarief en reistijd", () => {
    for (const l of LOCALES) {
      const t = WORKER_PUSH[l];
      expect(t.offerTitle("Kok"), l).toContain("Kok");
      const body = t.offerBody("Bakkerij De Vries", "Haarle", pushRate(t, 1750), 22);
      for (const deel of ["Bakkerij De Vries", "Haarle", "€ 17,50", "22"]) expect(body, `${l}: ${deel}`).toContain(deel);
    }
  });

  it("gaat in de app-taal van de werker, en Nederlands zonder bekende taal", async () => {
    const bouw = { freelancerId: "f1", shiftId: "s1", data: {}, teksten: (t: (typeof WORKER_PUSH)["nl"]) => ({ title: t.offerTitle("Kok"), body: t.offerBody("Bakkerij De Vries", "Haarle", pushRate(t, 1750), 22) }) };
    expect(await sendShiftOffer(bouw)).toBe(true);
    expect(JSON.parse(h.payloads[0] ?? "{}")).toMatchObject({ title: "Nieuwe klus: Kok", data: { type: "SHIFT_OFFER", shiftId: "s1" } });
    h.kv.set("werker-taal:u1", { locale: "pl" });
    await sendShiftOffer(bouw);
    const pl = JSON.parse(h.payloads[1] ?? "{}") as { title: string; body: string };
    expect(pl.title).toBe("Nowe zlecenie: Kok");
    expect(pl.body).toContain("dojazdu");
  });
});
