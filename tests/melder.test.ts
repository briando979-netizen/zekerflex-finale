import { beforeEach, describe, expect, it, vi } from "vitest";

// De melder met een geheugen-KV en nagemaakte kanalen: wat gaat direct, wat wacht, wat doet de uursamenvatting.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  push: vi.fn(async (..._args: unknown[]) => 1),
  stuur: vi.fn(async (..._args: unknown[]) => undefined),
  ingericht: { waarde: false },
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.com" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, JSON.parse(JSON.stringify(v))),
  kvListEntries: async (prefix: string, limit = 1000) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix)).slice(0, limit).map(([key, value]) => ({ key, value })),
  kvDeleteStale: async (prefix: string) => {
    h.kv.set("test:laatste-opruiming", prefix);
    return 0;
  },
}));
vi.mock("@/lib/messaging/contacts", () => ({ platformAdminIds: async () => ["beheerder-1"] }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => h.push(...a) }));
vi.mock("@/lib/whatsapp/brug", () => ({ brugIngericht: () => h.ingericht.waarde, liveStuur: (...a: unknown[]) => h.stuur(...a) }));

import { bewaarInstelling, leesGebeurtenissen, leesInstelling, meldGebeurtenis, stuurSamenvatting } from "@/lib/ops/melder";
import { DIRECT_PER_UUR } from "@/lib/ops/gebeurtenis";

const DAG = new Date("2026-11-18T10:00:00+01:00");
const NACHT = new Date("2026-11-18T02:00:00+01:00");
const seconden = (basis: Date, n: number) => new Date(basis.getTime() + n * 1000);

beforeEach(() => {
  h.kv.clear();
  h.push.mockClear();
  h.push.mockImplementation(async () => 1);
  h.stuur.mockClear();
  h.stuur.mockImplementation(async () => undefined);
  h.ingericht.waarde = false;
});

describe("melder: direct of wachten", () => {
  it("een belangrijke gebeurtenis overdag gaat direct als melding en staat in het logboek", async () => {
    const g = await meldGebeurtenis({ soort: "bestelling", titel: "Nieuwe webshopbestelling", url: "/admin/shop" }, DAG);
    expect(g?.gemeld).toBe("direct");
    expect(h.push).toHaveBeenCalledTimes(1);
    const push = h.push.mock.calls[0] as [string[], { title: string; data: Record<string, string> }];
    expect(push[0]).toEqual(["beheerder-1"]);
    expect(push[1].title).toBe("🛒 Nieuwe webshopbestelling");
    expect(push[1].data.url).toBe("/admin/shop");
    expect(await leesGebeurtenissen()).toHaveLength(1);
  });

  it("'s nachts, of als samenvatting bedoeld, wacht hij op het uurbericht", async () => {
    expect((await meldGebeurtenis({ soort: "klus", titel: "Nieuwe klus geplaatst" }, NACHT))?.gemeld).toBe("wacht");
    expect((await meldGebeurtenis({ soort: "mail", titel: "E-mail verstuurd: welkom", belang: "samenvatting" }, DAG))?.gemeld).toBe("wacht");
    expect(h.push).not.toHaveBeenCalled();
    expect(await leesGebeurtenissen()).toHaveLength(2);
  });

  it("met de meldingen uit wordt alles alleen bijgehouden", async () => {
    await bewaarInstelling({ aan: false, telefoon: "", whatsapp: false });
    const g = await meldGebeurtenis({ soort: "bestelling", titel: "Nieuwe webshopbestelling" }, DAG);
    expect(g?.gemeld).toBe("wacht");
    expect(h.push).not.toHaveBeenCalled();
    expect(await leesGebeurtenissen()).toHaveLength(1);
  });

  it("na 30 directe berichten in een uur gaat de rest naar het uurbericht", async () => {
    for (let i = 0; i < DIRECT_PER_UUR; i += 1) await meldGebeurtenis({ soort: "bestelling", titel: "Nieuwe webshopbestelling" }, seconden(DAG, i));
    expect(h.push).toHaveBeenCalledTimes(DIRECT_PER_UUR);
    const een = await meldGebeurtenis({ soort: "klus", titel: "Nieuwe klus geplaatst" }, seconden(DAG, 60));
    expect(een?.gemeld).toBe("wacht");
    expect(h.push).toHaveBeenCalledTimes(DIRECT_PER_UUR);
  });

  it("een push die niemand bereikt telt niet als gemeld", async () => {
    h.push.mockImplementation(async () => 0);
    const g = await meldGebeurtenis({ soort: "bestelling", titel: "Nieuwe webshopbestelling" }, DAG);
    expect(g?.gemeld).toBe("wacht");
  });

  it("een storing in het kanaal gooit nooit en de gebeurtenis blijft bewaard", async () => {
    h.push.mockImplementation(async () => {
      throw new Error("push stuk");
    });
    const g = await meldGebeurtenis({ soort: "klus", titel: "Nieuwe klus geplaatst" }, DAG);
    expect(g?.gemeld).toBe("wacht");
    expect(await leesGebeurtenissen()).toHaveLength(1);
  });
});

describe("melder: WhatsApp", () => {
  it("met een gekoppelde brug gaat het bericht naar het eigen nummer en niet ook nog als push", async () => {
    h.ingericht.waarde = true;
    await bewaarInstelling({ aan: true, telefoon: "06 34 82 57 80", whatsapp: true });
    const g = await meldGebeurtenis({ soort: "demo", titel: "Demo ingepland" }, DAG);
    expect(g?.gemeld).toBe("direct");
    expect(h.stuur).toHaveBeenCalledWith("31634825780@s.whatsapp.net", "📅 Demo ingepland");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("is de brug niet gekoppeld of niet bereikbaar, dan komt het als push", async () => {
    await bewaarInstelling({ aan: true, telefoon: "0634825780", whatsapp: true });
    await meldGebeurtenis({ soort: "demo", titel: "Demo ingepland" }, DAG);
    expect(h.stuur).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledTimes(1);
    h.ingericht.waarde = true;
    h.stuur.mockImplementation(async () => {
      throw new Error("niet verbonden");
    });
    await meldGebeurtenis({ soort: "demo", titel: "Nog een demo" }, seconden(DAG, 5));
    expect(h.push).toHaveBeenCalledTimes(2);
  });
});

describe("melder: instelling", () => {
  it("een nummer wordt opgeslagen als cijfers met landcode; een ongeldig nummer wordt geweigerd", async () => {
    expect(await bewaarInstelling({ aan: true, telefoon: "06 34 82 57 80", whatsapp: true })).toEqual({ aan: true, telefoon: "31634825780", whatsapp: true });
    await expect(bewaarInstelling({ aan: true, telefoon: "abc", whatsapp: false })).rejects.toThrow();
    expect(await leesInstelling()).toMatchObject({ telefoon: "31634825780" });
  });

  it("zonder nummer kan WhatsApp niet aan, en de standaard is: aan, geen nummer", async () => {
    expect(await leesInstelling()).toEqual({ aan: true, telefoon: null, whatsapp: false });
    expect(await bewaarInstelling({ aan: true, telefoon: "", whatsapp: true })).toEqual({ aan: true, telefoon: null, whatsapp: false });
  });
});

describe("melder: het uurbericht", () => {
  it("bundelt wat wacht in één bericht, markeert het en stuurt de tweede keer niets", async () => {
    await meldGebeurtenis({ soort: "mail", titel: "E-mail verstuurd: welkom", belang: "samenvatting" }, seconden(DAG, 0));
    await meldGebeurtenis({ soort: "mail", titel: "E-mail verstuurd: welkom", belang: "samenvatting" }, seconden(DAG, 1));
    await meldGebeurtenis({ soort: "chat", titel: "Een chatbericht verstuurd", belang: "samenvatting" }, seconden(DAG, 2));
    const uitslag = await stuurSamenvatting(seconden(DAG, 3000));
    expect(uitslag).toEqual({ aantal: 3, gemeld: true, reden: null });
    expect(h.push).toHaveBeenCalledTimes(1);
    const push = h.push.mock.calls[0] as [string[], { title: string; body: string }];
    expect(push[1].title).toContain("3 gebeurtenissen");
    expect(push[1].body).toContain("✉️ Verstuurde e-mails: 2");
    expect((await leesGebeurtenissen()).every((g) => g.gemeld === "samenvatting")).toBe(true);
    expect(await stuurSamenvatting(seconden(DAG, 3600))).toEqual({ aantal: 0, gemeld: false, reden: "niets te melden" });
    expect(h.push).toHaveBeenCalledTimes(1);
  });

  it("'s nachts of met de meldingen uit wordt er niets gestuurd en blijft alles wachten", async () => {
    await meldGebeurtenis({ soort: "mail", titel: "E-mail verstuurd: welkom", belang: "samenvatting" }, DAG);
    expect((await stuurSamenvatting(NACHT)).reden).toBe("buiten de meldtijd");
    await bewaarInstelling({ aan: false, telefoon: "", whatsapp: false });
    expect((await stuurSamenvatting(seconden(DAG, 100))).reden).toBe("meldingen staan uit");
    expect(h.push).not.toHaveBeenCalled();
    expect((await leesGebeurtenissen())[0]?.gemeld).toBe("wacht");
  });

  it("bereikt het bericht niemand, dan blijft alles wachten tot het volgende uur", async () => {
    await meldGebeurtenis({ soort: "chat", titel: "Een chatbericht verstuurd", belang: "samenvatting" }, DAG);
    h.push.mockImplementation(async () => 0);
    expect(await stuurSamenvatting(seconden(DAG, 3000))).toEqual({ aantal: 1, gemeld: false, reden: "geen kanaal bereikte de eigenaar" });
    expect((await leesGebeurtenissen())[0]?.gemeld).toBe("wacht");
    h.push.mockImplementation(async () => 1);
    expect((await stuurSamenvatting(seconden(DAG, 6600))).gemeld).toBe(true);
  });

  it("ruimt het logboek op (30 dagen) en gooit niet bij een lege lijst", async () => {
    await stuurSamenvatting(DAG);
    expect(h.kv.get("test:laatste-opruiming")).toBe("gebeurtenis:");
  });
});
