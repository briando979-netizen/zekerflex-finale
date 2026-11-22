import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De opslag van de community (lib/community/store.ts) en het wissen voor de AVG (lib/community/avg.ts), met een KV in het
// geheugen in plaats van Postgres. Compare-and-swap op `versie` zoals kvVervangAlsVeld. De klok staat vast.

const h = vi.hoisted(() => {
  const kv = new Map<string, unknown>();
  const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    kv,
    mod: {
      kvGet: async (k: string) => (kv.has(k) ? kopie(kv.get(k)) : null),
      kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => kv.has(k)).map((k) => [k, kopie(kv.get(k))])),
      kvSet: async (k: string, v: unknown) => {
        kv.set(k, kopie(v));
      },
      kvSetIfAbsent: async (k: string, v: unknown) => {
        if (kv.has(k)) return false;
        kv.set(k, kopie(v));
        return true;
      },
      kvVervangAlsVeld: async (k: string, veld: string, oud: string | null, nieuw: unknown) => {
        const huidig = kv.get(k) as Record<string, unknown> | undefined;
        if (!huidig || (huidig[veld] ?? null) !== oud) return false;
        kv.set(k, kopie(nieuw));
        return true;
      },
      kvDelete: async (k: string) => {
        kv.delete(k);
      },
      kvListValues: async (p: string) => [...kv].filter(([k]) => k.startsWith(p)).map(([, v]) => kopie(v)),
      kvListEntries: async (p: string) => [...kv].filter(([k]) => k.startsWith(p)).map(([key, v]) => ({ key, value: kopie(v) })),
    },
    gewist: [] as string[],
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => h.mod);
vi.mock("@/lib/community/fotos", () => ({
  wisFotos: async (ids: string[]) => {
    h.gewist.push(...ids);
    return ids.length;
  },
}));

import { AppError } from "@/lib/errors";
import { GRENZEN, WELKOM_ID, type Onderwerp, type ReactieLijst } from "@/lib/community/regels";
import {
  alleOnderwerpen,
  beheerBericht,
  bewaarLosseFoto,
  leesOnderwerp,
  leesReacties,
  maakOnderwerp,
  maakReactie,
  meld,
  sitemapOnderwerpen,
  verwijderEigen,
  wachtrij,
  zetHandig,
} from "@/lib/community/store";
import { exportCommunityVan, wisCommunityVan } from "@/lib/community/avg";

const NU = new Date("2026-11-22T14:30:00+01:00");
const invoer = (auteurId: string, titel = "Mijn eerste dienst") => ({ auteurId, titel, tekst: "Hoe ging jouw eerste dienst in de horeca?", categorie: "ervaringen" as const, fotoIds: [] });

beforeEach(() => {
  h.kv.clear();
  h.gewist.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

describe("onderwerpen en reacties", () => {
  it("het welkomstonderwerp is er altijd, ook in een lege opslag", async () => {
    const lijst = await alleOnderwerpen();
    expect(lijst.map((o) => o.id)).toEqual([WELKOM_ID]);
    expect((await leesOnderwerp(WELKOM_ID))?.team).toBe(true);
    // zonder reacties nog niet in de sitemap
    expect(await sitemapOnderwerpen()).toEqual([]);
  });

  it("een reactie telt op bij het onderwerp; het welkomstonderwerp wordt dan bewaard", async () => {
    const { onderwerp } = await maakReactie(WELKOM_ID, { auteurId: "u1", tekst: "Hoi, ik ben Jan", fotoIds: [] }, NU);
    expect(onderwerp.aantalReacties).toBe(1);
    expect(h.kv.has(`community-onderwerp:${WELKOM_ID}`)).toBe(true);
    expect((await leesReacties(WELKOM_ID)).map((r) => r.tekst)).toEqual(["Hoi, ik ben Jan"]);
    expect(await sitemapOnderwerpen()).toEqual([{ pad: "/community/welkom-stel-je-voor", laatsteOp: NU.toISOString() }]);
  });

  it("hooguit 5 onderwerpen per dag per gebruiker (429), morgen weer", async () => {
    for (let i = 0; i < GRENZEN.onderwerpenPerDag; i++) await maakOnderwerp(invoer("u1", `Onderwerp nummer ${i}`), NU);
    const zesde = await maakOnderwerp(invoer("u1"), NU).catch((e: unknown) => e);
    expect(zesde).toBeInstanceOf(AppError);
    expect((zesde as AppError).status).toBe(429);
    // een ander mag nog, en de volgende dag ook weer
    await expect(maakOnderwerp(invoer("u2"), NU)).resolves.toMatchObject({ auteurId: "u2" });
    await expect(maakOnderwerp(invoer("u1"), new Date("2026-11-23T09:00:00+01:00"))).resolves.toMatchObject({ auteurId: "u1" });
  });

  it("een foto alleen als hij van jou is en nog los staat", async () => {
    await bewaarLosseFoto("u1", "fabc123def4567", NU);
    await expect(maakOnderwerp({ ...invoer("u2"), fotoIds: ["fabc123def4567"] }, NU)).rejects.toThrow(/verlopen of al gebruikt/);
    const o = await maakOnderwerp({ ...invoer("u1"), fotoIds: ["fabc123def4567"] }, NU);
    expect(o.fotos).toEqual(["fabc123def4567"]);
    // twee keer dezelfde foto gebruiken kan niet
    await expect(maakOnderwerp({ ...invoer("u1"), fotoIds: ["fabc123def4567"] }, NU)).rejects.toThrow(/verlopen of al gebruikt/);
  });

  it("losse foto's ouder dan een dag gaan weg bij de volgende upload", async () => {
    await bewaarLosseFoto("u1", "foud1234567890", new Date("2026-11-20T10:00:00+01:00"));
    expect(await bewaarLosseFoto("u1", "fnieuw12345678", NU)).toEqual(["foud1234567890"]);
  });

  it("Handig één keer per gebruiker, aan en uit, niet bij je eigen bericht", async () => {
    const o = await maakOnderwerp(invoer("u1"), NU);
    expect(await zetHandig("u2", o.id, null)).toEqual({ aantal: 1, aan: true });
    expect(await zetHandig("u3", o.id, null)).toEqual({ aantal: 2, aan: true });
    expect(await zetHandig("u2", o.id, null)).toEqual({ aantal: 1, aan: false });
    await expect(zetHandig("u1", o.id, null)).rejects.toThrow(/eigen bericht/);
  });

  it("je eigen reactie verwijderen: tekst en foto's weg, het aantal gaat omlaag; die van een ander niet", async () => {
    const o = await maakOnderwerp(invoer("u1"), NU);
    const { reactie } = await maakReactie(o.id, { auteurId: "u2", tekst: "Goed verhaal!", fotoIds: [] }, NU);
    await expect(verwijderEigen("u1", o.id, reactie.id)).rejects.toThrow(/niet van jou/);
    await verwijderEigen("u2", o.id, reactie.id);
    const [r] = await leesReacties(o.id);
    expect(r).toMatchObject({ status: "verwijderd", tekst: "" });
    expect((await leesOnderwerp(o.id))?.aantalReacties).toBe(0);
  });
});

describe("melden en beheer", () => {
  it("na drie verschillende melders verborgen en in de wachtrij; dezelfde melder telt één keer", async () => {
    const o = await maakOnderwerp(invoer("u1"), NU);
    const m = (door: string) => meld({ onderwerpId: o.id, reactieId: null, door, reden: "spam", toelichting: "" }, NU);
    expect(await m("u:a")).toEqual({ nieuw: true, verborgen: false });
    expect(await m("u:a")).toEqual({ nieuw: false, verborgen: false });
    expect(await m("ip:x")).toEqual({ nieuw: true, verborgen: false });
    expect(await m("u:b")).toEqual({ nieuw: true, verborgen: true });
    expect((await leesOnderwerp(o.id))?.status).toBe("verborgen");
    expect((await wachtrij()).map((i) => i.onderwerpId)).toEqual([o.id]);
  });

  it("tonen door beheer: weer zichtbaar, oude meldingen tellen niet meer, uit de wachtrij", async () => {
    const o = await maakOnderwerp(invoer("u1"), NU);
    for (const d of ["u:a", "u:b", "u:c"]) await meld({ onderwerpId: o.id, reactieId: null, door: d, reden: "spam", toelichting: "" }, NU);
    await beheerBericht("tonen", o.id, null, "", new Date("2026-11-22T15:00:00+01:00"));
    const na = (await leesOnderwerp(o.id)) as Onderwerp;
    expect(na.status).toBe("zichtbaar");
    expect(na.verborgenDoor).toBeUndefined();
    expect(await wachtrij()).toEqual([]);
    // een nieuwe melding van een eerdere melder telt weer, maar één melding verbergt niet
    expect(await meld({ onderwerpId: o.id, reactieId: null, door: "u:a", reden: "spam", toelichting: "" }, new Date("2026-11-22T16:00:00+01:00"))).toEqual({ nieuw: true, verborgen: false });
  });

  it("verwijderen door beheer: tekst weg, de reden blijft voor de schrijver, de foto's van schijf", async () => {
    await bewaarLosseFoto("u1", "fabc123def4567", NU);
    const o = await maakOnderwerp({ ...invoer("u1"), fotoIds: ["fabc123def4567"] }, NU);
    expect(await beheerBericht("verwijderen", o.id, null, "reclame", NU)).toEqual(["fabc123def4567"]);
    expect(await leesOnderwerp(o.id)).toMatchObject({ status: "verwijderd", tekst: "", fotos: [], beheerReden: "reclame" });
    await expect(beheerBericht("tonen", o.id, null, "", NU)).rejects.toThrow(/kan niet meer terug/);
  });
});

describe("AVG: wissen en inzage", () => {
  it("wist eigen reacties, haalt een onderwerp zonder reacties van anderen weg en houdt er een met reacties anoniem", async () => {
    const alleen = await maakOnderwerp(invoer("u1", "Alleen van mij"), NU);
    const samen = await maakOnderwerp(invoer("u1", "Met reacties van anderen"), NU);
    await maakReactie(samen.id, { auteurId: "u2", tekst: "Mooi verhaal", fotoIds: [] }, NU);
    const ander = await maakOnderwerp(invoer("u2", "Van iemand anders"), NU);
    await maakReactie(ander.id, { auteurId: "u1", tekst: "Ik ben Jan uit Groningen", fotoIds: [] }, NU);
    await zetHandig("u1", ander.id, null);
    await meld({ onderwerpId: ander.id, reactieId: null, door: "u:u1", reden: "anders", toelichting: "" }, NU);
    await bewaarLosseFoto("u1", "flos1234567890", NU);

    const inzage = await exportCommunityVan("u1");
    expect(inzage).toMatchObject({ handigGegeven: 1, meldingenGedaan: 1 });
    expect((inzage.onderwerpen as unknown[]).length).toBe(2);
    expect((inzage.reacties as unknown[]).length).toBe(1);

    expect(await wisCommunityVan("u1")).toBe(3);
    expect(await leesOnderwerp(alleen.id)).toMatchObject({ status: "verwijderd", auteurId: null, gewist: true, tekst: "" });
    expect(await leesOnderwerp(samen.id)).toMatchObject({ status: "zichtbaar", auteurId: null, gewist: true, titel: "Met reacties van anderen" });
    expect((await leesOnderwerp(samen.id))?.tekst).not.toContain("horeca");
    const reactie = (h.kv.get(`community-reacties:${ander.id}`) as ReactieLijst).reacties[0];
    expect(reactie).toMatchObject({ status: "verwijderd", auteurId: null, tekst: "" });
    const anderNa = (await leesOnderwerp(ander.id)) as Onderwerp;
    expect(anderNa.handig).toEqual([]);
    expect(anderNa.meldingen.every((m) => !m.door.includes("u1"))).toBe(true);
    expect(anderNa.aantalReacties).toBe(0);
    expect(h.gewist).toContain("flos1234567890");
    expect(h.kv.has("community-gebruiker:u1")).toBe(false);
    // nergens staat het id nog
    expect(JSON.stringify([...h.kv.values()])).not.toContain('"u1"');
  });
});
