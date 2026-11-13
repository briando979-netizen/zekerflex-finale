import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAB_NAAM, TAB_SLEUTELS, isStandaardTabVolgorde, normalizeTabVolgorde, sorteerTabs, standaardTabVolgorde } from "@/lib/werker/tab-volgorde";

// De volgorde van de balk onderaan de werker-app (Site-ontwerper, tabblad Menu, 13 nov): de beheerder versleept de knoppen.
// Alleen de volgorde; er verdwijnt niets. Zonder eigen volgorde is de balk precies zoals hij was.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));

import { getTabVolgorde, resetTabVolgorde, setTabVolgorde } from "@/lib/werker/tab-volgorde-store";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const tabs = (...keys: string[]) => keys.map((key) => ({ key }));
const OUD = ["discover", "myJobs", "hours", "bank", "chat", "account"];

beforeEach(() => kv.clear());

describe("de standaard is de gewone balk", () => {
  it("de lijst is dezelfde als de knoppen in de shell, in dezelfde volgorde", () => {
    expect([...TAB_SLEUTELS]).toEqual(OUD);
    const shell = bron("components/app/FreelancerShell.tsx");
    const inShell = [...shell.matchAll(/\{ href: "\/dashboard\/[a-z]+", key: "([A-Za-z]+)", icon:/g)].map((m) => m[1]);
    expect(inShell).toEqual(OUD);
  });

  it("zonder eigen volgorde komt dezelfde lijst terug; de standaardvolgorde verandert ook niets", () => {
    const t = tabs("discover", "myJobs", "hours", "chat", "account");
    expect(sorteerTabs(t, null)).toBe(t);
    expect(sorteerTabs(t, undefined)).toBe(t);
    expect(sorteerTabs(t, standaardTabVolgorde())).toEqual(t);
    expect(isStandaardTabVolgorde(standaardTabVolgorde())).toBe(true);
  });

  it("elke knop heeft een naam voor de beheerder", () => {
    for (const s of TAB_SLEUTELS) expect(TAB_NAAM[s].naam.length, s).toBeGreaterThan(2);
  });
});

describe("een eigen volgorde", () => {
  it("verandert alleen de volgorde, ook als een knop niet zichtbaar is (bank uit, of tijdens de start)", () => {
    const v = ["account", "chat", "bank", "hours", "myJobs", "discover"];
    expect(sorteerTabs(tabs("discover", "myJobs", "hours", "chat", "account"), v).map((t) => t.key)).toEqual(["account", "chat", "hours", "myJobs", "discover"]);
    expect(sorteerTabs(tabs("discover", "account"), v).map((t) => t.key)).toEqual(["account", "discover"]);
    expect(isStandaardTabVolgorde(v)).toBe(false);
  });

  it("onbekende en dubbele knoppen vallen weg; wat ontbreekt komt achteraan", () => {
    expect(normalizeTabVolgorde(["chat", "chat", "constructor", 4, "discover"])).toEqual(["chat", "discover", "myJobs", "hours", "bank", "account"]);
    for (const raw of [null, undefined, "x", 3, {}, []]) expect(normalizeTabVolgorde(raw)).toEqual(OUD);
  });

  it("een knop die de volgorde niet kent, blijft staan", () => {
    expect(sorteerTabs(tabs("discover", "nieuw", "chat"), ["chat", "discover"]).map((t) => t.key)).toEqual(["chat", "discover", "nieuw"]);
  });
});

describe("de opslag", () => {
  it("geen eigen versie = null; bewaren en teruglezen; gelijk aan de standaard wist de sleutel", async () => {
    expect(await getTabVolgorde()).toBeNull();
    expect((await setTabVolgorde(["chat"]))?.[0]).toBe("chat");
    expect((await getTabVolgorde())?.[0]).toBe("chat");
    expect(await setTabVolgorde(OUD)).toBeNull();
    expect(kv.has("ontwerp:werker-tabs")).toBe(false);
  });

  it("terug naar de standaard", async () => {
    await setTabVolgorde(["account"]);
    await resetTabVolgorde();
    expect(await getTabVolgorde()).toBeNull();
  });
});

describe("de app, het paneel en de route", () => {
  it("de shell sorteert de zichtbare knoppen; de layout geeft de volgorde mee en een storing geeft de standaard", () => {
    const shell = bron("components/app/FreelancerShell.tsx");
    expect(shell).toContain("const tabs = sorteerTabs(zichtbaar, tabVolgorde);");
    expect(shell).toContain("tabVolgorde = null,");
    // een clientbestand: alleen de pure regels, niet de opslag
    expect(shell).not.toContain("tab-volgorde-store");
    expect(bron("app/dashboard/layout.tsx")).toContain("tabVolgorde={await getTabVolgorde().catch(() => null)}");
  });

  it("de regels zijn puur: geen opslag, database of mail", () => {
    const regels = bron("lib/werker/tab-volgorde.ts");
    expect(regels).not.toMatch(/^import /m);
  });

  it("het paneel staat in het tabblad Menu, met verslepen", () => {
    expect(bron("components/admin/ontwerper/Ontwerper.tsx")).toContain("<WerkerTabsPaneel />");
    const paneel = bron("components/admin/ontwerper/WerkerTabsPaneel.tsx");
    expect(paneel).toContain("{...sleep.lijst}");
    expect(paneel).toContain("<SleepGreep");
    expect(paneel).not.toContain("tab-volgorde-store");
  });

  it("de route is alleen voor de platformbeheerder", () => {
    const route = bron("app/api/admin/ontwerp/werker-tabs/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g) ?? []).toHaveLength(3);
  });
});
