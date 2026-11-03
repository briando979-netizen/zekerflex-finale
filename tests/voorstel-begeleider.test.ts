import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (store.has(k) ? store.get(k) : null),
  kvSet: async (k: string, v: unknown) => {
    store.set(k, v);
  },
  kvDelete: async (k: string) => {
    store.delete(k);
  },
  kvListEntries: async () => [],
  kvListValues: async () => [],
  kvFindByField: async (prefix: string, veld: string, waarde: string) =>
    [...store.entries()].filter(([k, v]) => k.startsWith(prefix) && (v as Record<string, unknown>)[veld] === waarde).map(([, v]) => v),
}));

import { boekingenVanAccount, voorGast, zetBegeleider, type Boeking } from "@/lib/voorstel/schwarzwald-boekingen";

const SLEUTEL = "voorstel-schwarzwald:boeking:2026-11-03:ABCDEF12";
const boeking: Boeking = {
  id: "ABCDEF12",
  activiteit: "buggy-rijden",
  datum: "2026-11-03",
  tijd: "14:00",
  personen: 4,
  naam: "Gerda Gast",
  email: "gerda@example.com",
  telefoon: "0612345678",
  opmerking: "",
  status: "bevestigd",
  aangemaakt: new Date().toISOString(),
  account: "gerda@example.com",
};

describe("begeleider per groep", () => {
  beforeEach(() => {
    store.clear();
    store.set(SLEUTEL, boeking);
  });

  it("slaat de naam netjes op en haalt hem weg met een lege naam", async () => {
    expect((await zetBegeleider("2026-11-03", "ABCDEF12", "  Sanne   de Vries ")).begeleider).toBe("Sanne de Vries");
    expect((store.get(SLEUTEL) as Boeking).begeleider).toBe("Sanne de Vries");
    const leeg = await zetBegeleider("2026-11-03", "ABCDEF12", "  ");
    expect("begeleider" in leeg).toBe(false);
  });

  it("weigert een onbekende boeking", async () => {
    await expect(zetBegeleider("2026-11-03", "nietgeldig", "Sanne")).rejects.toThrow(/Onbekende boeking/);
    await expect(zetBegeleider("2026-11-04", "ABCDEF12", "Sanne")).rejects.toThrow(/niet gevonden/);
  });

  it("de gast ziet de begeleider niet (account en export), de rest blijft", async () => {
    await zetBegeleider("2026-11-03", "ABCDEF12", "Sanne");
    const [eigen] = await boekingenVanAccount("gerda@example.com");
    expect(eigen).toBeDefined();
    expect(eigen && "begeleider" in eigen).toBe(false);
    expect(eigen?.tijd).toBe("14:00");
    const gast = voorGast({ ...boeking, begeleider: "Sanne", aanwezig: "ja" });
    expect("begeleider" in gast).toBe(false);
    expect(gast.aanwezig).toBe("ja");
  });
});
