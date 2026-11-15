import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { BLOKKEN, BLOK_KLAAR, mededelingenVoor, schoneBlokken, volgendeId } from "@/lib/horeca-personeel/model";
import { leesPersoneel } from "@/lib/horeca-personeel/schema";
import {
  bewaarDashboard,
  koppelAccount,
  leesPersoneelVan,
  leesUitnodigingsToken,
  nieuweUitnodiging,
  nodigUit,
  plaatsMededeling,
  stopMedewerker,
  verwijderDashboard,
  verwijderMedewerker,
  verwijzingVan,
  wijzigMedewerker,
} from "@/lib/horeca-personeel/store";
import { personeelTeksten, type PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// Het eigen personeel van een horecazaak: dashboards per rol, uitnodigen, het account koppelen, stoppen en mededelingen.

const T = "tenantAAAA1";

beforeEach(() => m.kv.clear());

describe("model", () => {
  it("alleen onderdelen die werken en bestaan, in vaste volgorde, zonder dubbelen", () => {
    expect(schoneBlokken(["mededelingen", "taken", "taken", "bestaatniet"])).toEqual(["taken", "mededelingen"]);
    // een onderdeel dat nog niet klaar is, wordt geweigerd
    for (const b of BLOKKEN) if (!BLOK_KLAAR[b]) expect(schoneBlokken([b])).toEqual([]);
  });

  it("een nieuw id is het laagste vrije nummer", () => {
    expect(volgendeId("d", [])).toBe("d1");
    expect(volgendeId("d", [{ id: "d1" }, { id: "d3" }])).toBe("d2");
  });

  it("mededelingen: voor iedereen of voor dit dashboard, nieuwste eerst", () => {
    const d = {
      versie: 1 as const,
      dashboards: [],
      medewerkers: [],
      mededelingen: [
        { id: "a", tekst: "oud", datum: "2026-11-01T10:00:00Z", dashboardIds: [] },
        { id: "b", tekst: "keuken", datum: "2026-11-02T10:00:00Z", dashboardIds: ["d2"] },
        { id: "c", tekst: "bediening", datum: "2026-11-03T10:00:00Z", dashboardIds: ["d1"] },
      ],
    };
    expect(mededelingenVoor(d, "d1").map((x) => x.id)).toEqual(["c", "a"]);
    expect(mededelingenVoor(d, "d2").map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("schema", () => {
  it("leest een geldige waarde en weigert rommel", () => {
    expect(leesPersoneel({ versie: 1, dashboards: [], medewerkers: [], mededelingen: [] })).not.toBeNull();
    expect(leesPersoneel(null)).toBeNull();
    expect(leesPersoneel({ versie: 2 })).toBeNull();
    expect(leesPersoneel({ versie: 1, dashboards: [{ id: "d1", naam: "x", blokken: ["onzin"] }], medewerkers: [], mededelingen: [] })).toBeNull();
  });
});

describe("dashboards", () => {
  it("maakt, wijzigt en verwijdert; een onbekend onderdeel valt weg", async () => {
    let d = await bewaarDashboard(T, { naam: " Bediening ", blokken: ["taken", "loonstroken", "onzin"] });
    expect(d.dashboards).toEqual([{ id: "d1", naam: "Bediening", blokken: ["taken"] }]);
    d = await bewaarDashboard(T, { id: "d1", naam: "Zaal", blokken: ["mededelingen", "taken"] });
    expect(d.dashboards[0]).toEqual({ id: "d1", naam: "Zaal", blokken: ["taken", "mededelingen"] });
    d = await verwijderDashboard(T, "d1");
    expect(d.dashboards).toEqual([]);
  });

  it("een dashboard met actieve of uitgenodigde medewerkers kan niet weg", async () => {
    await bewaarDashboard(T, { naam: "Keuken", blokken: ["taken"] });
    await nodigUit(T, "Zaak", { naam: "Piet", email: "piet@voorbeeld.test", functie: "", dashboardId: "d1" });
    await expect(verwijderDashboard(T, "d1")).rejects.toThrow(/medewerkers/);
  });
});

describe("uitnodigen en account koppelen", () => {
  async function opzet() {
    await bewaarDashboard(T, { naam: "Keuken", blokken: ["taken", "mededelingen"] });
    return nodigUit(T, "Zaak Een", { naam: "Piet Jansen", email: " Piet@Voorbeeld.TEST ", functie: " souschef ", dashboardId: "d1" });
  }

  it("bewaart de medewerker met een schoon adres en geeft een ondertekende link terug", async () => {
    const { medewerker, token } = await opzet();
    expect(medewerker).toMatchObject({ naam: "Piet Jansen", email: "piet@voorbeeld.test", functie: "souschef", status: "uitgenodigd", userId: null });
    const t = await leesUitnodigingsToken(token);
    expect(t).toMatchObject({ tenantId: T, tenantName: "Zaak Een", medewerkerId: medewerker.id, email: "piet@voorbeeld.test" });
    expect(await leesUitnodigingsToken(token + "x")).toBeNull();
    expect(await leesUitnodigingsToken("rommel")).toBeNull();
  });

  it("dezelfde persoon twee keer uitnodigen kan niet, een onbekend dashboard ook niet", async () => {
    await opzet();
    await expect(nodigUit(T, "Zaak", { naam: "P", email: "piet@voorbeeld.test", functie: "", dashboardId: "d1" })).rejects.toThrow(/al in je lijst/);
    await expect(nodigUit(T, "Zaak", { naam: "Els", email: "els@voorbeeld.test", functie: "", dashboardId: "d9" })).rejects.toThrow(/dashboard/);
  });

  it("het account koppelen maakt de medewerker actief en zet de verwijzing; een tweede keer kan niet", async () => {
    const { medewerker } = await opzet();
    await koppelAccount(T, medewerker.id, "user1");
    expect((await leesPersoneelVan(T)).medewerkers[0]).toMatchObject({ status: "actief", userId: "user1" });
    expect(await verwijzingVan("user1")).toEqual({ tenantId: T, medewerkerId: medewerker.id });
    await expect(koppelAccount(T, medewerker.id, "user2")).rejects.toThrow(/niet meer geldig/);
  });

  it("een nieuwe link kan alleen zolang de uitnodiging openstaat", async () => {
    const { medewerker } = await opzet();
    expect((await nieuweUitnodiging(T, "Zaak", medewerker.id)).token).toBeTruthy();
    await koppelAccount(T, medewerker.id, "user1");
    await expect(nieuweUitnodiging(T, "Zaak", medewerker.id)).rejects.toThrow();
  });

  it("stoppen haalt de verwijzing weg zodat hij niet meer binnenkomt; een actieve medewerker kan niet zomaar verwijderd worden", async () => {
    const { medewerker } = await opzet();
    await koppelAccount(T, medewerker.id, "user1");
    await expect(verwijderMedewerker(T, medewerker.id)).rejects.toThrow(/Stop eerst/);
    await stopMedewerker(T, medewerker.id);
    expect(await verwijzingVan("user1")).toBeNull();
    expect((await leesPersoneelVan(T)).medewerkers[0]?.status).toBe("gestopt");
    expect((await verwijderMedewerker(T, medewerker.id)).medewerkers).toEqual([]);
  });

  it("een medewerker een ander dashboard of een andere functie geven", async () => {
    await bewaarDashboard(T, { naam: "Bar", blokken: ["taken"] });
    const { medewerker } = await opzet();
    const d = await wijzigMedewerker(T, medewerker.id, { dashboardId: "d2", functie: "barchef" });
    expect(d.medewerkers[0]).toMatchObject({ dashboardId: "d2", functie: "barchef" });
    await expect(wijzigMedewerker(T, medewerker.id, { dashboardId: "d9" })).rejects.toThrow();
  });

  it("de gegevens van een ander bedrijf zijn niet te zien", async () => {
    await opzet();
    expect((await leesPersoneelVan("tenantBBBB2")).medewerkers).toEqual([]);
  });
});

describe("mededelingen", () => {
  it("plaatst met de tijd van nu, kent alleen bestaande dashboards en houdt er hooguit 30", async () => {
    await bewaarDashboard(T, { naam: "Keuken", blokken: ["mededelingen"] });
    let d = await plaatsMededeling(T, { tekst: " Vrijdag extra druk ", dashboardIds: ["d1", "d9"] }, new Date("2026-11-15T10:00:00Z"));
    expect(d.mededelingen[0]).toMatchObject({ tekst: "Vrijdag extra druk", datum: "2026-11-15T10:00:00.000Z", dashboardIds: ["d1"] });
    for (let i = 0; i < 35; i += 1) d = await plaatsMededeling(T, { tekst: `n${i}`, dashboardIds: [] });
    expect(d.mededelingen).toHaveLength(30);
  });
});

describe("teksten: Nederlands en Engels", () => {
  const platte = (o: unknown, pad = "", uit: Record<string, string> = {}): Record<string, string> => {
    if (typeof o === "string") uit[pad] = o;
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) platte(v, pad ? `${pad}.${k}` : k, uit);
    return uit;
  };
  const plaatshouders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
  const nl: PersoneelTeksten = personeelTeksten("nl");
  const en: PersoneelTeksten = personeelTeksten("en");
  const a = platte(nl);
  const b = platte(en);

  it("dezelfde sleutels en dezelfde plaatshouders, niets leeg", () => {
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const [k, v] of Object.entries(a)) {
      expect(plaatshouders(b[k] ?? ""), k).toBe(plaatshouders(v));
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect((b[k] ?? "").trim().length, k).toBeGreaterThan(0);
    }
  });

  it("elk onderdeel heeft een naam en uitleg", () => {
    for (const blok of BLOKKEN) {
      expect(nl.blok[blok].naam).toBeTruthy();
      expect(en.blok[blok].uitleg).toBeTruthy();
    }
  });
});
