import { beforeEach, describe, expect, it, vi } from "vitest";

// De opslag draait in dit bestand op een gewone Map: dezelfde functies als lib/storage/kv, zonder database.
const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
  // pagineren op sleutel, zoals de echte kvFindDue: sleutel na `na`, veld <= grens, op sleutel, hooguit `limit`
  kvFindDue: async (p: string, veld: string, grens: string, na = "", limit = 500) =>
    [...m.kv]
      .filter(([k, v]) => k.startsWith(p) && k > na && String((v as Record<string, unknown>)[veld]) <= grens)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, limit)
      .map(([key, v]) => ({ key, value: structuredClone(v) })),
  kvDeleteStale: async (p: string) => {
    let n = 0;
    for (const k of [...m.kv.keys()]) if (k.startsWith(p)) (m.kv.delete(k), (n += 1));
    return n;
  },
}));

import {
  alleRijen,
  wisAfsprakenVanOrganisatie,
  afsprakenTussen,
  afsprakenVanDag,
  afsprakenVanKlant,
  bewaarInstellingen,
  bewaarNotitie,
  boek,
  klantenLijst,
  leesAfspraak,
  leesInstellingen,
  nieuwId,
  openInstellingenVanSlug,
  verwijderKlant,
  zetStatus,
} from "@/lib/afspraken/store";
import { beginInstellingen, klantSleutel, type Afspraak, type Instellingen } from "@/lib/afspraken/model";

const NU = new Date("2026-11-12T06:00:00Z"); // donderdag, 07:00 in Nederland
const T = "tenant1";
let i: Instellingen;

beforeEach(() => {
  m.kv.clear();
  i = { ...beginInstellingen("Kapper Jan", nieuwId), actief: true };
});

const invoer = (start: string, over: Partial<Parameters<typeof boek>[2]> = {}): Parameters<typeof boek>[2] => ({
  dienstId: i.diensten[0]!.id,
  medewerkerId: i.medewerkers[0]!.id,
  start: new Date(start),
  klant: { naam: "Piet Jansen", telefoon: "06 1234 5678", email: "piet@voorbeeld.nl" },
  opmerking: "Graag een korte baard",
  bron: "online",
  ...over,
});

describe("instellingen en het boekadres", () => {
  it("bewaart en leest terug, en een boekpagina is alleen open als het bedrijf hem aanzette", async () => {
    await bewaarInstellingen(T, i);
    expect(await leesInstellingen(T)).toEqual(i);
    expect((await openInstellingenVanSlug(i.slug))?.tenantId).toBe(T);
    await bewaarInstellingen(T, { ...i, actief: false });
    expect(await openInstellingenVanSlug(i.slug)).toBeNull();
  });

  it("een adres is van één organisatie; een nieuw adres maakt het oude vrij", async () => {
    await bewaarInstellingen(T, i);
    await expect(bewaarInstellingen("tenant2", { ...i, bedrijfsnaam: "Andere kapper" })).rejects.toThrow(/al van een ander bedrijf/);
    await bewaarInstellingen(T, { ...i, slug: "kapper-jan-nieuw" });
    expect(await openInstellingenVanSlug(i.slug)).toBeNull();
    // het oude adres is weer vrij voor een ander bedrijf
    await bewaarInstellingen("tenant2", { ...i, bedrijfsnaam: "Andere kapper" });
    expect((await openInstellingenVanSlug(i.slug))?.tenantId).toBe("tenant2");
  });

  it("een onzin-adres uit een URL levert niets op, ook niet voor 'constructor'", async () => {
    for (const s of ["../x", "ab", "constructor", "Kapper-Jan", "a".repeat(80)]) expect(await openInstellingenVanSlug(s), s).toBeNull();
  });
});

describe("boeken", () => {
  beforeEach(async () => bewaarInstellingen(T, i));

  it("maakt een bevestigde afspraak met de namen van dat moment, en de dag staat in het id", async () => {
    const a = await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    expect(a).toMatchObject({ status: "bevestigd", dienstNaam: "Afspraak", duurMin: 30, bron: "online", eind: "2026-11-12T08:30:00.000Z" });
    expect(a.id).toMatch(/^2026-11-12~[a-f0-9]{10}$/);
    expect(await afsprakenVanDag(T, "2026-11-12")).toHaveLength(1);
    expect((await leesAfspraak(T, a.id))?.klant.naam).toBe("Piet Jansen");
  });

  it("dezelfde tijd twee keer boeken kan niet: de tweede krijgt een nette melding", async () => {
    await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await expect(boek(T, i, invoer("2026-11-12T08:00:00Z", { klant: { naam: "Els", telefoon: "", email: "els@voorbeeld.nl" } }), NU)).rejects.toThrow(/net bezet/);
    expect(await afsprakenVanDag(T, "2026-11-12")).toHaveLength(1);
  });

  it("een tijd buiten de openingstijden, of een tijd die niet op het raster valt, wordt geweigerd", async () => {
    await expect(boek(T, i, invoer("2026-11-12T20:00:00Z"), NU)).rejects.toThrow(/niet meer beschikbaar/);
    await expect(boek(T, i, invoer("2026-11-12T08:07:00Z"), NU)).rejects.toThrow(/niet meer beschikbaar/);
  });

  it("een onbekende dienst of medewerker wordt geweigerd met een gewone zin", async () => {
    await expect(boek(T, i, invoer("2026-11-12T08:00:00Z", { dienstId: "bestaatniet" }), NU)).rejects.toThrow(/dienst en een medewerker/);
    await expect(boek(T, i, invoer("2026-11-12T08:00:00Z", { medewerkerId: "bestaatniet" }), NU)).rejects.toThrow(/dienst en een medewerker/);
  });

  it("het bedrijf zelf mag aan de balie ook binnen de voorlooptijd boeken, een klant online niet", async () => {
    const nu = new Date("2026-11-12T08:15:00Z"); // 09:15, de voorlooptijd is een uur
    await expect(boek(T, i, invoer("2026-11-12T08:30:00Z"), nu)).rejects.toThrow(/niet meer beschikbaar/);
    const a = await boek(T, i, invoer("2026-11-12T08:30:00Z", { bron: "balie" }), nu);
    expect(a.bron).toBe("balie");
  });

  it("annuleren maakt de tijd weer vrij; geweest en niet gekomen houden hem bezet", async () => {
    const a = await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await zetStatus(T, a.id, "geannuleerd");
    const b = await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    expect(b.id).not.toBe(a.id);
    await zetStatus(T, b.id, "geweest");
    await expect(boek(T, i, invoer("2026-11-12T08:00:00Z"), NU)).rejects.toThrow(/net bezet/);
  });

  it("schrijven twee klanten tegelijk dezelfde tijd, dan blijft de eerste en wordt de tweede teruggedraaid", async () => {
    // de eerste afspraak is er al (gemaakt vóór de nu-tijd van de tweede) maar de tweede las de dag voordat die erbij kwam
    const eerste = await boek(T, i, invoer("2026-11-12T09:00:00Z"), new Date("2026-11-12T06:00:00Z"));
    const lees = await import("@/lib/storage/kv");
    // simuleer: de dag lijkt leeg bij de eerste controle, de eerste afspraak verschijnt pas na het schrijven
    const echt = lees.kvListValues;
    let aanroepen = 0;
    const spy = vi.spyOn(lees, "kvListValues").mockImplementation(async (p: string, l?: number) => {
      aanroepen += 1;
      return aanroepen === 1 ? [] : echt(p, l ?? 1000);
    });
    await expect(boek(T, i, invoer("2026-11-12T09:00:00Z", { klant: { naam: "Els", telefoon: "", email: "els@voorbeeld.nl" } }), new Date("2026-11-12T06:00:01Z"))).rejects.toThrow(/net bezet geraakt/);
    spy.mockRestore();
    const over = await afsprakenVanDag(T, "2026-11-12");
    expect(over.map((a) => a.id)).toEqual([eerste.id]);
  });

  it("afsprakenTussen geeft de dagen in een periode op tijd gesorteerd en laat andere organisaties met rust", async () => {
    await boek(T, i, invoer("2026-11-12T10:00:00Z"), NU);
    await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await boek(T, i, invoer("2026-11-13T08:00:00Z"), NU);
    await bewaarInstellingen("tenant2", { ...i, slug: "andere-zaak" });
    await boek("tenant2", { ...i, slug: "andere-zaak" }, invoer("2026-11-12T08:00:00Z"), NU);
    const lijst = await afsprakenTussen(T, "2026-11-12", "2026-11-13");
    expect(lijst).toHaveLength(3);
    expect(lijst.map((a) => a.start)).toEqual(["2026-11-12T08:00:00.000Z", "2026-11-12T10:00:00.000Z", "2026-11-13T08:00:00.000Z"]);
    expect(await afsprakenTussen(T, "kapot", "2026-11-13")).toEqual([]);
  });
});

describe("statussen", () => {
  beforeEach(async () => bewaarInstellingen(T, i));

  it("leesAfspraak en zetStatus weigeren een id dat geen id is, en een afspraak die er niet is", async () => {
    expect(await leesAfspraak(T, "../../x")).toBeNull();
    await expect(zetStatus(T, "2026-11-12~bestaatniet1", "geweest")).rejects.toThrow(/bestaat niet/);
  });
});

describe("klantenkaart", () => {
  beforeEach(async () => bewaarInstellingen(T, i));

  it("voegt afspraken van dezelfde klant samen, met de notitie erbij", async () => {
    const a = await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await boek(T, i, invoer("2026-11-13T08:00:00Z"), NU);
    await zetStatus(T, a.id, "geweest");
    const sleutel = klantSleutel({ email: "piet@voorbeeld.nl", telefoon: "" });
    await bewaarNotitie(T, sleutel, "  Wil graag een korte baard. ");
    const { klanten: [k, ...rest], afgekapt } = await klantenLijst(T, NU);
    expect(rest).toEqual([]);
    expect(afgekapt).toBe(false);
    expect(k).toMatchObject({ naam: "Piet Jansen", aantal: 2, geweest: 1, notitie: "Wil graag een korte baard." });
    const van = await afsprakenVanKlant(T, sleutel);
    expect(van.afspraken.map((x) => x.start.slice(8, 10))).toEqual(["13", "12"]);
    expect(van.afgekapt).toBe(false);
  });

  it("een lege notitie wist hem", async () => {
    await bewaarNotitie(T, "e-a@b.nl", "iets");
    await bewaarNotitie(T, "e-a@b.nl", "   ");
    expect((await klantenLijst(T, NU)).klanten).toEqual([]);
  });

  it("een klant wissen haalt zijn naam, nummer, adres, opmerking en notitie overal weg, maar houdt de afspraak als lege regel", async () => {
    const a = await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    const sleutel = klantSleutel({ email: "piet@voorbeeld.nl", telefoon: "" });
    await bewaarNotitie(T, sleutel, "Vertrouwelijk");
    expect(await verwijderKlant(T, sleutel)).toBe(1);
    const over = (await leesAfspraak(T, a.id))!;
    expect(over.klant).toEqual({ naam: "Verwijderd", telefoon: "", email: "" });
    expect(over.opmerking).toBe("");
    expect(over.status).toBe("bevestigd"); // de agenda en de cijfers kloppen nog
    expect((await klantenLijst(T, NU)).klanten).toEqual([]);
    expect(JSON.stringify([...m.kv.values()])).not.toMatch(/Piet|voorbeeld\.nl|Vertrouwelijk|korte baard/);
  });

  it("een andere klant en een andere organisatie blijven onaangeroerd", async () => {
    await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await boek(T, i, invoer("2026-11-12T09:00:00Z", { klant: { naam: "Els", telefoon: "", email: "els@voorbeeld.nl" } }), NU);
    await verwijderKlant(T, klantSleutel({ email: "piet@voorbeeld.nl", telefoon: "" }));
    expect((await klantenLijst(T, NU)).klanten.map((k) => k.naam)).toEqual(["Els"]);
  });

  /** Zet n afspraken van dezelfde klant rechtstreeks in de opslag, zonder de boekregels (sneller en voor de grens). */
  const vul = (tenant: string, n: number, dag = "2026-11-12") => {
    for (let x = 0; x < n; x += 1) {
      const id = `${dag}~${String(x).padStart(6, "0")}`;
      m.kv.set(`afspraken:item:${tenant}:${id}`, { id, dienstId: "d", dienstNaam: "Afspraak", duurMin: 30, prijsCent: null, medewerkerId: "w", medewerkerNaam: "Jan", start: `${dag}T08:00:00.000Z`, eind: `${dag}T08:30:00.000Z`, klant: { naam: "Piet", telefoon: "", email: "piet@voorbeeld.nl" }, opmerking: "", status: "bevestigd", bron: "online", gemaaktOp: "2026-11-01T08:00:00.000Z" });
    }
  };

  it("een lijst met meer dan één pagina (500) komt compleet terug, niet afgekapt", async () => {
    vul(T, 1_234);
    const { klanten, afgekapt } = await klantenLijst(T, NU);
    expect(afgekapt).toBe(false);
    expect(klanten[0]?.aantal).toBe(1_234);
    const van = await afsprakenVanKlant(T, klantSleutel({ email: "piet@voorbeeld.nl", telefoon: "" }));
    expect(van.afspraken).toHaveLength(1_234);
    expect(van.afgekapt).toBe(false);
  });

  it("alleRijen stopt bij de grens en zegt dat de lijst niet compleet is (nooit stil iets weglaten)", async () => {
    vul(T, 1_100);
    const bij = await alleRijen<Afspraak>("afspraken:item:tenant1:", "gemaaktOp", "9999", 1_100);
    expect(bij).toMatchObject({ afgekapt: false });
    expect(bij.rijen).toHaveLength(1_100);
    const over = await alleRijen<Afspraak>("afspraken:item:tenant1:", "gemaaktOp", "9999", 1_000);
    expect(over.afgekapt).toBe(true);
    expect(over.rijen).toHaveLength(1_000);
    const exact = await alleRijen<Afspraak>("afspraken:item:tenant1:", "gemaaktOp", "9999", 500);
    expect(exact.afgekapt).toBe(true);
    expect(exact.rijen).toHaveLength(500);
    expect((await alleRijen<Afspraak>("afspraken:item:leeg:", "gemaaktOp", "9999")).rijen).toEqual([]);
  });

  it("wissen van een klant weigert (met uitleg) als er te veel afspraken zijn om zeker alles te wissen, en wist anders álles", async () => {
    vul(T, 700);
    expect(await verwijderKlant(T, klantSleutel({ email: "piet@voorbeeld.nl", telefoon: "" }))).toBe(700);
    expect(JSON.stringify([...m.kv.values()])).not.toMatch(/piet@voorbeeld/);
  });
});

describe("agenda per dag (afsprakenTussen)", () => {
  beforeEach(async () => bewaarInstellingen(T, i));

  it("haalt per dag op: een drukke dag buiten de periode kost niets, en niets uit de periode valt weg", async () => {
    // 6.000 afspraken op een dag ver weg: de oude opzet (alles ophalen, daarna filteren) liet daardoor de week vallen
    for (let x = 0; x < 6_000; x += 1) {
      const id = `2026-12-24~${String(x).padStart(6, "0")}`;
      m.kv.set(`afspraken:item:${T}:${id}`, { id, start: "2026-12-24T08:00:00.000Z", eind: "2026-12-24T08:30:00.000Z", status: "bevestigd", klant: { naam: "X", telefoon: "", email: "" }, medewerkerId: "w", gemaaktOp: "2026-11-01T08:00:00.000Z" });
    }
    await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await boek(T, i, invoer("2026-11-18T08:00:00Z"), NU);
    const week = await afsprakenTussen(T, "2026-11-12", "2026-11-18");
    expect(week.map((a) => a.start.slice(0, 10))).toEqual(["2026-11-12", "2026-11-18"]);
  });

  it("een omgekeerde periode geeft niets, en een periode is hooguit 63 dagen", async () => {
    expect(await afsprakenTussen(T, "2026-11-13", "2026-11-12")).toEqual([]);
    for (const dag of ["2027-01-13", "2027-01-14"]) m.kv.set(`afspraken:item:${T}:${dag}~aaaaaaaaaa`, { id: `${dag}~aaaaaaaaaa`, start: `${dag}T08:00:00.000Z` });
    const lijst = await afsprakenTussen(T, "2026-11-12", "2027-03-01");
    expect(lijst.map((a) => a.id)).toEqual(["2027-01-13~aaaaaaaaaa"]); // 12 nov + 62 dagen = 13 jan: 14 jan valt er net buiten
  });
});

describe("een organisatie wissen", () => {
  it("wist instellingen, boekadres, afspraken en notities van die organisatie, en niets van een andere", async () => {
    await bewaarInstellingen(T, i);
    await bewaarInstellingen("tenant2", { ...i, slug: "andere-zaak" });
    await boek(T, i, invoer("2026-11-12T08:00:00Z"), NU);
    await boek("tenant2", { ...i, slug: "andere-zaak" }, invoer("2026-11-12T08:00:00Z"), NU);
    await bewaarNotitie(T, "e-a@b.nl", "geheim");
    expect(await wisAfsprakenVanOrganisatie(T, NU)).toBe(3);
    expect([...m.kv.keys()].filter((k) => k.includes(`:${T}:`) || k === `afspraken:inst:${T}` || k === `afspraken:slug:${i.slug}`)).toEqual([]);
    expect(await openInstellingenVanSlug(i.slug)).toBeNull();
    expect((await afsprakenVanDag("tenant2", "2026-11-12")).length).toBe(1);
    expect((await openInstellingenVanSlug("andere-zaak"))?.tenantId).toBe("tenant2");
  });

  it("weigert een leeg of vreemd id (een te breed voorvoegsel zou alles raken)", async () => {
    await bewaarInstellingen(T, i);
    for (const t of ["", "ab", "../x", "a:b"]) await expect(wisAfsprakenVanOrganisatie(t, NU), t).rejects.toThrow(/geen geldige organisatie/);
    expect(await leesInstellingen(T)).not.toBeNull();
  });
});
