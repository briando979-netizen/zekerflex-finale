import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-geheim-test-geheim-test-geheim", APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { geldigePositie, magNaar, maakKlantBeeld, positieOud, richting, vensterTekst, volgendeStatussen, type Afspraak } from "@/lib/installatie/model";
import { leesToken, maakAfspraak, maakToken, zetPositie, zetStatus, leesAfspraak, lijstAfspraken } from "@/lib/installatie/store";

const NU = new Date("2026-11-12T13:30:00+01:00");

function afspraak(delta: Partial<Afspraak> = {}): Afspraak {
  return {
    id: "abc123def456",
    klantNaam: "Café De Dam",
    adres: "Dam 1",
    plaats: "Amsterdam",
    lat: 52.373,
    lon: 4.893,
    venster: { van: "2026-11-12T13:00:00+01:00", tot: "2026-11-12T15:00:00+01:00" },
    monteurNaam: "Piet de Vries",
    regels: ["1 × Kassa"],
    notitie: "Achteringang",
    status: "gepland",
    positie: null,
    tijden: { gepland: "2026-11-10T09:00:00+01:00" },
    gemaakt: "2026-11-10T09:00:00+01:00",
    ...delta,
  };
}

const nieuw = () => ({
  klantNaam: "Café De Dam",
  adres: "Dam 1",
  plaats: "Amsterdam",
  lat: 52.373,
  lon: 4.893,
  venster: { van: "2026-11-12T13:00:00+01:00", tot: "2026-11-12T15:00:00+01:00" },
  monteurNaam: "Piet de Vries",
  regels: ["1 × Kassa"],
});

beforeEach(() => m.kv.clear());

describe("statussen", () => {
  it("laat alleen toegestane stappen toe", () => {
    expect(magNaar("gepland", "onderweg")).toBe(true);
    expect(magNaar("gepland", "klaar")).toBe(false);
    expect(magNaar("onderweg", "aangekomen")).toBe(true);
    expect(magNaar("onderweg", "gepland")).toBe(true);
    expect(magNaar("bezig", "klaar")).toBe(true);
    expect(magNaar("klaar", "bezig")).toBe(false);
    expect(volgendeStatussen("klaar")).toEqual([]);
  });
});

describe("wat de klant ziet", () => {
  it("toont de voornaam van de monteur en nooit de achternaam of de opmerking voor kantoor", () => {
    const b = maakKlantBeeld(afspraak(), NU);
    expect(b.monteur).toBe("Piet");
    expect(JSON.stringify(b)).not.toMatch(/Vries|Achteringang/);
  });

  it("geeft het tijdvak in Nederlandse tijd", () => {
    expect(vensterTekst(afspraak().venster)).toBe("donderdag 12 november, tussen 13:00 en 15:00");
  });

  it("toont de bus en een aankomsttijd alleen onderweg en alleen met een verse positie", () => {
    const onderweg = afspraak({ status: "onderweg", positie: { lat: 52.35, lon: 4.9, at: NU.toISOString() } });
    const b = maakKlantBeeld(onderweg, NU);
    expect(b.positie).not.toBeNull();
    expect(b.etaMinuten).toBeGreaterThan(0);
    expect(b.etaTijd).toMatch(/^\d{2}:\d{2}$/);
    expect(b.tekst).toMatch(/onderweg/);

    const oud = maakKlantBeeld(afspraak({ status: "onderweg", positie: { lat: 52.35, lon: 4.9, at: new Date(NU.getTime() - 10 * 60_000).toISOString() } }), NU);
    expect(oud.positieOud).toBe(true);
    expect(oud.etaTijd).toBeNull();

    const bezig = maakKlantBeeld(afspraak({ status: "bezig", positie: { lat: 52.35, lon: 4.9, at: NU.toISOString() } }), NU);
    expect(bezig.positie).toBeNull();
  });

  it("markeert de voortgang en geeft bij annuleren geen actieve stap", () => {
    const b = maakKlantBeeld(afspraak({ status: "aangekomen" }), NU);
    expect(b.stappen.filter((s) => s.gedaan).map((s) => s.key)).toEqual(["gepland", "onderweg"]);
    expect(b.stappen.find((s) => s.actief)?.key).toBe("aangekomen");
    expect(maakKlantBeeld(afspraak({ status: "geannuleerd" }), NU).stappen.some((s) => s.actief || s.gedaan)).toBe(false);
  });
});

describe("hulpjes", () => {
  it("noemt een positie oud na twee minuten", () => {
    expect(positieOud({ lat: 1, lon: 1, at: NU.toISOString() }, NU)).toBe(false);
    expect(positieOud({ lat: 1, lon: 1, at: new Date(NU.getTime() - 3 * 60_000).toISOString() }, NU)).toBe(true);
    expect(positieOud(null, NU)).toBe(true);
  });

  it("rekent de richting uit: oost is 90 graden, noord is 0", () => {
    expect(richting({ lat: 52, lon: 5 }, { lat: 52, lon: 5.1 })).toBe(90);
    expect(richting({ lat: 52, lon: 5 }, { lat: 52.1, lon: 5 })).toBe(0);
  });

  it("weigert onmogelijke plekken en (0, 0)", () => {
    expect(geldigePositie(52, 5)).toBe(true);
    expect(geldigePositie(0, 0)).toBe(false);
    expect(geldigePositie(91, 5)).toBe(false);
    expect(geldigePositie("52", 5)).toBe(false);
  });
});

describe("links", () => {
  it("maakt per rol een eigen code en herkent elke code alleen voor die rol", () => {
    const klant = maakToken("abc123def456", "klant");
    const monteur = maakToken("abc123def456", "monteur");
    expect(klant).not.toBe(monteur);
    expect(leesToken(klant)).toEqual({ id: "abc123def456", rol: "klant" });
    expect(leesToken(monteur)).toEqual({ id: "abc123def456", rol: "monteur" });
  });

  it("weigert alles wat niet klopt: een andere afspraak, een verknoeide handtekening, rommel", () => {
    const klant = maakToken("abc123def456", "klant");
    expect(leesToken(klant.slice(0, -1) + "x")).toBeNull();
    expect(leesToken(`otherid1234.${klant.split(".")[1]}`)).toBeNull();
    expect(leesToken("")).toBeNull();
    expect(leesToken("geen-punt")).toBeNull();
    expect(leesToken("../etc/passwd.xxxxxxxxxxxxxxxxxxxxxx")).toBeNull();
    expect(leesToken("a".repeat(200))).toBeNull();
  });
});

describe("opslag en stappen", () => {
  it("maakt een afspraak die gepland is, zonder positie, en zet hem bovenaan de lijst", async () => {
    const a = await maakAfspraak(nieuw());
    expect(a.status).toBe("gepland");
    expect(a.positie).toBeNull();
    const b = await maakAfspraak({ ...nieuw(), klantNaam: "Tweede zaak" });
    expect((await lijstAfspraken()).map((x) => x.id)).toEqual([b.id, a.id]);
    expect((await leesAfspraak(a.id))?.klantNaam).toBe("Café De Dam");
  });

  it("weigert een tijdvak dat achterstevoren staat en een onmogelijke plek", async () => {
    await expect(maakAfspraak({ ...nieuw(), venster: { van: "2026-11-12T15:00:00+01:00", tot: "2026-11-12T13:00:00+01:00" } })).rejects.toThrow(/tijdvak/);
    await expect(maakAfspraak({ ...nieuw(), lat: 0, lon: 0 })).rejects.toThrow(/plek/);
  });

  it("bewaart de positie alleen onderweg en wist hem zodra de monteur er is", async () => {
    const a = await maakAfspraak(nieuw());
    // gepland: een positie wordt genegeerd
    expect((await zetPositie(a.id, { lat: 52.3, lon: 4.9 }, NU)).positie).toBeNull();
    await zetStatus(a.id, "onderweg", NU);
    const metPositie = await zetPositie(a.id, { lat: 52.3, lon: 4.9, nauwkeurigheid: 12 }, NU);
    expect(metPositie.positie).toMatchObject({ lat: 52.3, lon: 4.9, nauwkeurigheid: 12 });
    const aangekomen = await zetStatus(a.id, "aangekomen", new Date(NU.getTime() + 60_000));
    expect(aangekomen.positie).toBeNull();
    expect(aangekomen.tijden.aangekomen).toBeDefined();
  });

  it("negeert een positie die te snel op de vorige volgt", async () => {
    const a = await maakAfspraak(nieuw());
    await zetStatus(a.id, "onderweg", NU);
    await zetPositie(a.id, { lat: 52.3, lon: 4.9 }, NU);
    const snel = await zetPositie(a.id, { lat: 52.31, lon: 4.91 }, new Date(NU.getTime() + 1_000));
    expect(snel.positie?.lat).toBe(52.3);
    const later = await zetPositie(a.id, { lat: 52.31, lon: 4.91 }, new Date(NU.getTime() + 5_000));
    expect(later.positie?.lat).toBe(52.31);
  });

  it("laat geen sprong over een stap toe en meldt dat in gewoon Nederlands", async () => {
    const a = await maakAfspraak(nieuw());
    await expect(zetStatus(a.id, "klaar", NU)).rejects.toThrow(/kan nu niet/);
    await expect(zetStatus("bestaatniet0", "onderweg", NU)).rejects.toThrow(/bestaat niet meer/);
  });

  it("dezelfde stap nog eens is geen fout", async () => {
    const a = await maakAfspraak(nieuw());
    await zetStatus(a.id, "onderweg", NU);
    expect((await zetStatus(a.id, "onderweg", NU)).status).toBe("onderweg");
  });
});
