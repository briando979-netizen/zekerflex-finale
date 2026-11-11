import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));

import {
  LINK_SLEUTEL,
  alleUitvoeringen,
  leesSjabloon,
  leesUitvoering,
  leggVast,
  linkHash,
  maakLink,
  maakOverzicht,
  maakSjabloon,
  sjabloonVanSleutel,
  sjablonenVan,
  trekLinkIn,
  uitvoerderNamen,
  uitvoeringenTussen,
  uitvoeringenVanDag,
  wijzigSjabloon,
  wisUitvoerder,
} from "@/lib/checklists/store";
import type { SjabloonInvoer, UitvoeringInvoer } from "@/lib/checklists/model";

const invoer = (over: Partial<SjabloonInvoer> = {}): SjabloonInvoer => ({
  naam: "Sluitronde",
  locatie: "Keuken",
  taken: [
    { id: "t1", tekst: "Vloer", opmerkingVerplicht: false },
    { id: "t2", tekst: "Afval", opmerkingVerplicht: true },
  ],
  herhaling: { soort: "dagelijks", dagen: [], uiterlijk: "07:00", volgendeDag: false },
  actief: true,
  ...over,
});
const antwoord = (over: Partial<UitvoeringInvoer> = {}): UitvoeringInvoer => ({
  uitvoerder: "Piet",
  taken: [
    { id: "t1", tekst: "Vloer", gedaan: true, opmerking: "" },
    { id: "t2", tekst: "Afval", gedaan: true, opmerking: "" },
  ],
  notitie: "",
  compleet: true,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
  m.kv.clear();
});
afterEach(() => vi.useRealTimers());

describe("sjablonen", () => {
  it("maakt een sjabloon per organisatie; een andere organisatie ziet hem niet", async () => {
    const s = await maakSjabloon("t1", invoer());
    expect(s.gemaaktOp).toBe("2026-11-12T10:00:00.000Z");
    expect(s.gearchiveerdOp).toBeNull();
    expect(s.linkHash).toBeNull();
    expect((await sjablonenVan("t1")).map((x) => x.id)).toEqual([s.id]);
    expect(await sjablonenVan("t2")).toEqual([]);
    expect(await leesSjabloon("t2", s.id)).toBeNull();
    expect(await leesSjabloon("t1", "constructor")).toBeNull();
    expect(await leesSjabloon("t1", "../x")).toBeNull();
  });
  it("een nieuw gearchiveerd sjabloon krijgt meteen een archiefmoment", async () => {
    const s = await maakSjabloon("t1", invoer({ actief: false }));
    expect(s.gearchiveerdOp).toBe("2026-11-12T10:00:00.000Z");
  });
  it("wijzigen behoudt het moment van maken en de link; de volgorde van taken volgt de invoer", async () => {
    const s = await maakSjabloon("t1", invoer());
    const { sleutel } = await maakLink("t1", s.id, "Bedrijf");
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    const nieuw = await wijzigSjabloon("t1", s.id, invoer({ taken: [...invoer().taken].reverse(), naam: "Opening" }));
    expect(nieuw.naam).toBe("Opening");
    expect(nieuw.taken.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(nieuw.gemaaktOp).toBe(s.gemaaktOp);
    expect(await sjabloonVanSleutel(sleutel)).not.toBeNull();
  });
  it("archiveren legt het moment vast en houdt het eerste moment bij nog eens opslaan; weer actief haalt het weg", async () => {
    const s = await maakSjabloon("t1", invoer());
    const a1 = await wijzigSjabloon("t1", s.id, invoer({ actief: false }), new Date("2026-11-13T08:00:00Z"));
    expect(a1.gearchiveerdOp).toBe("2026-11-13T08:00:00.000Z");
    const a2 = await wijzigSjabloon("t1", s.id, invoer({ actief: false, naam: "Nieuwe naam" }), new Date("2026-11-20T08:00:00Z"));
    expect(a2.gearchiveerdOp).toBe("2026-11-13T08:00:00.000Z");
    const weer = await wijzigSjabloon("t1", s.id, invoer());
    expect(weer.gearchiveerdOp).toBeNull();
  });
  it("een sjabloon van een andere organisatie aanpassen mislukt", async () => {
    const s = await maakSjabloon("t1", invoer());
    await expect(wijzigSjabloon("t2", s.id, invoer())).rejects.toMatchObject({ status: 404 });
  });
  it("hoogstens 100 checklists", async () => {
    for (let i = 0; i < 100; i++) await maakSjabloon("t1", invoer({ naam: `Lijst ${i}` }));
    await expect(maakSjabloon("t1", invoer())).rejects.toMatchObject({ status: 422 });
  });
});

describe("invullink", () => {
  it("de sleutel staat nergens in de opslag, alleen een hash", async () => {
    const s = await maakSjabloon("t1", invoer());
    const { sleutel, sjabloon } = await maakLink("t1", s.id, "Bedrijf");
    expect(sleutel).toMatch(LINK_SLEUTEL);
    expect(JSON.stringify([...m.kv])).not.toContain(sleutel);
    expect(sjabloon.linkHash).toBe(linkHash(sleutel));
    expect(m.kv.has(`checklist:link:${linkHash(sleutel)}`)).toBe(true);
  });
  it("de sleutel geeft het sjabloon en de organisatie; fout, onbekend of verkeerd formaat geeft niets", async () => {
    const s = await maakSjabloon("t1", invoer());
    const { sleutel } = await maakLink("t1", s.id, "Bedrijf BV");
    const open = await sjabloonVanSleutel(sleutel);
    expect(open?.tenantId).toBe("t1");
    expect(open?.sjabloon.id).toBe(s.id);
    expect(open?.bedrijfsnaam).toBe("Bedrijf BV");
    expect(await sjabloonVanSleutel(`${sleutel.slice(0, -1)}${sleutel.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(await sjabloonVanSleutel("kort")).toBeNull();
    expect(await sjabloonVanSleutel("")).toBeNull();
    expect(await sjabloonVanSleutel("constructor")).toBeNull();
    expect(await sjabloonVanSleutel("../".repeat(11))).toBeNull();
  });
  it("een nieuwe link maakt de oude ongeldig", async () => {
    const s = await maakSjabloon("t1", invoer());
    const een = await maakLink("t1", s.id, "B");
    const twee = await maakLink("t1", s.id, "B");
    expect(await sjabloonVanSleutel(een.sleutel)).toBeNull();
    expect(await sjabloonVanSleutel(twee.sleutel)).not.toBeNull();
    expect([...m.kv.keys()].filter((k) => k.startsWith("checklist:link:"))).toHaveLength(1);
  });
  it("intrekken: de link werkt niet meer en de hash is weg", async () => {
    const s = await maakSjabloon("t1", invoer());
    const { sleutel } = await maakLink("t1", s.id, "B");
    const na = await trekLinkIn("t1", s.id);
    expect(na.linkHash).toBeNull();
    expect(await sjabloonVanSleutel(sleutel)).toBeNull();
    expect([...m.kv.keys()].filter((k) => k.startsWith("checklist:link:"))).toHaveLength(0);
  });
  it("een gearchiveerde checklist is niet meer in te vullen, en weer actief maken zet de link weer open", async () => {
    const s = await maakSjabloon("t1", invoer());
    const { sleutel } = await maakLink("t1", s.id, "B");
    await wijzigSjabloon("t1", s.id, invoer({ actief: false }));
    expect(await sjabloonVanSleutel(sleutel)).toBeNull();
    await wijzigSjabloon("t1", s.id, invoer());
    expect(await sjabloonVanSleutel(sleutel)).not.toBeNull();
  });
  it("een link maken of intrekken voor een sjabloon van een ander bedrijf mislukt", async () => {
    const s = await maakSjabloon("t1", invoer());
    await expect(maakLink("t2", s.id, "B")).rejects.toMatchObject({ status: 404 });
    await expect(trekLinkIn("t2", s.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("uitvoeringen", () => {
  it("legt vast op de servertijd (UTC) met de Nederlandse dag in het id", async () => {
    const s = await maakSjabloon("t1", invoer());
    vi.setSystemTime(new Date("2026-11-12T23:30:00Z")); // 00:30 NL op 13 nov
    const { uitvoering, dubbel } = await leggVast("t1", s, antwoord(), { bron: "link" });
    expect(dubbel).toBe(false);
    expect(uitvoering.tijdstip).toBe("2026-11-12T23:30:00.000Z");
    expect(uitvoering.id.startsWith("2026-11-13~")).toBe(true);
    expect(uitvoering.sjabloonNaam).toBe("Sluitronde");
    expect(uitvoering.correctieVan).toBeNull();
    expect((await uitvoeringenVanDag("t1", "2026-11-13")).map((u) => u.id)).toEqual([uitvoering.id]);
    expect(await uitvoeringenVanDag("t1", "2026-11-12")).toEqual([]);
    expect(await leesUitvoering("t1", uitvoering.id)).toMatchObject({ uitvoerder: "Piet" });
    expect(await leesUitvoering("t2", uitvoering.id)).toBeNull();
  });
  it("dezelfde aanvraag-id geeft dezelfde uitvoering terug, ook na middernacht", async () => {
    const s = await maakSjabloon("t1", invoer());
    const een = await leggVast("t1", s, antwoord(), { bron: "link", aanvraagId: "abcdef123456" });
    vi.setSystemTime(new Date("2026-11-12T23:30:00Z"));
    const twee = await leggVast("t1", s, antwoord({ uitvoerder: "Iemand anders" }), { bron: "link", aanvraagId: "abcdef123456" });
    expect(twee.dubbel).toBe(true);
    expect(twee.uitvoering.id).toBe(een.uitvoering.id);
    expect(twee.uitvoering.uitvoerder).toBe("Piet");
    expect((await alleUitvoeringen("t1")).length).toBe(1);
    const andere = await leggVast("t1", s, antwoord(), { bron: "link", aanvraagId: "zzzzzz999999" });
    expect(andere.dubbel).toBe(false);
    expect((await alleUitvoeringen("t1")).length).toBe(2);
  });
  it("een kapotte aanvraag-id wordt geweigerd", async () => {
    const s = await maakSjabloon("t1", invoer());
    await expect(leggVast("t1", s, antwoord(), { bron: "link", aanvraagId: "x" })).rejects.toMatchObject({ status: 422 });
    await expect(leggVast("t1", s, antwoord(), { bron: "link", aanvraagId: "../../etc/passwd/xx" })).rejects.toMatchObject({ status: 422 });
  });
  it("een correctie is een nieuwe uitvoering met een verwijzing; de eerste blijft ongewijzigd", async () => {
    const s = await maakSjabloon("t1", invoer());
    const eerste = (await leggVast("t1", s, antwoord({ taken: antwoord().taken.map((t) => ({ ...t, gedaan: false, opmerking: "x" })), compleet: false }), { bron: "link" })).uitvoering;
    const voor = JSON.stringify(await leesUitvoering("t1", eerste.id));
    vi.setSystemTime(new Date("2026-11-12T11:00:00Z"));
    const tweede = (await leggVast("t1", s, antwoord(), { bron: "beheer", correctieVan: eerste.id })).uitvoering;
    expect(tweede.correctieVan).toBe(eerste.id);
    expect(tweede.id).not.toBe(eerste.id);
    expect(tweede.bron).toBe("beheer");
    expect(JSON.stringify(await leesUitvoering("t1", eerste.id))).toBe(voor);
  });
  it("een correctie op een onbekende uitvoering, een uitvoering van een ander sjabloon of een andere organisatie mislukt", async () => {
    const s = await maakSjabloon("t1", invoer());
    const ander = await maakSjabloon("t1", invoer({ naam: "Opening" }));
    const u = (await leggVast("t1", ander, antwoord(), { bron: "link" })).uitvoering;
    await expect(leggVast("t1", s, antwoord(), { bron: "beheer", correctieVan: "2026-11-12~bestaatniet" })).rejects.toMatchObject({ status: 404 });
    await expect(leggVast("t1", s, antwoord(), { bron: "beheer", correctieVan: u.id })).rejects.toMatchObject({ status: 404 });
    await expect(leggVast("t2", s, antwoord(), { bron: "beheer", correctieVan: u.id })).rejects.toMatchObject({ status: 404 });
  });
  it("tussen twee dagen, met een ongeldige dag als leeg antwoord", async () => {
    const s = await maakSjabloon("t1", invoer());
    for (const d of ["2026-11-10T10:00:00Z", "2026-11-11T10:00:00Z", "2026-11-12T10:00:00Z", "2026-11-14T10:00:00Z"]) {
      vi.setSystemTime(new Date(d));
      await leggVast("t1", s, antwoord(), { bron: "link" });
    }
    expect((await uitvoeringenTussen("t1", "2026-11-11", "2026-11-13")).map((u) => u.tijdstip.slice(0, 10))).toEqual(["2026-11-11", "2026-11-12"]);
    expect(await uitvoeringenTussen("t1", "nu", "2026-11-13")).toEqual([]);
    expect(await uitvoeringenTussen("t1", "2026-11-13", "2026-11-11")).toEqual([]);
    expect(await uitvoeringenTussen("t2", "2026-11-01", "2026-11-30")).toEqual([]);
  });
});

describe("overzicht uit de opslag", () => {
  it("telt een uitvoering van de dag erna mee voor een venster na middernacht", async () => {
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    const s = await maakSjabloon("t1", invoer({ herhaling: { soort: "dagelijks", dagen: [], uiterlijk: "02:00", volgendeDag: true } }));
    vi.setSystemTime(new Date("2026-11-13T00:30:00Z")); // 01:30 NL op 13 nov, hoort bij de ronde van 12 nov
    await leggVast("t1", s, antwoord(), { bron: "link" });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    const { overzicht } = await maakOverzicht("t1", "2026-11-12", "2026-11-12");
    expect(overzicht.rijen.map((r) => [r.dag, r.status])).toEqual([["2026-11-12", "compleet"]]);
  });
  it("een andere organisatie heeft eigen rijen", async () => {
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    await maakSjabloon("t1", invoer());
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    expect((await maakOverzicht("t2", "2026-11-12", "2026-11-12")).overzicht.rijen).toEqual([]);
    expect((await maakOverzicht("t1", "2026-11-12", "2026-11-12")).overzicht.gemist).toHaveLength(1);
  });
});

describe("gegevens van een uitvoerder wissen", () => {
  it("vervangt de naam in alle uitvoeringen door Verwijderd en laat de rest staan", async () => {
    const s = await maakSjabloon("t1", invoer());
    await leggVast("t1", s, antwoord({ uitvoerder: "Piet Jansen" }), { bron: "link" });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    await leggVast("t1", s, antwoord({ uitvoerder: " piet  jansen " }), { bron: "link" });
    await leggVast("t1", s, antwoord({ uitvoerder: "Klaas", notitie: "Notitie blijft" }), { bron: "link" });
    expect(await wisUitvoerder("t1", "Piet Jansen")).toBe(2);
    const alle = await alleUitvoeringen("t1");
    expect(alle.map((u) => u.uitvoerder).sort()).toEqual(["Klaas", "Verwijderd", "Verwijderd"]);
    const gewist = alle.find((u) => u.uitvoerder === "Verwijderd");
    expect(gewist?.compleet).toBe(true);
    expect(gewist?.taken).toHaveLength(2);
    expect(JSON.stringify([...m.kv])).not.toContain("Jansen");
    expect(await wisUitvoerder("t1", "Piet Jansen")).toBe(0);
  });
  it("raakt een andere organisatie niet", async () => {
    const s1 = await maakSjabloon("t1", invoer());
    const s2 = await maakSjabloon("t2", invoer());
    await leggVast("t1", s1, antwoord({ uitvoerder: "Piet" }), { bron: "link" });
    await leggVast("t2", s2, antwoord({ uitvoerder: "Piet" }), { bron: "link" });
    expect(await wisUitvoerder("t1", "Piet")).toBe(1);
    expect((await alleUitvoeringen("t2"))[0]?.uitvoerder).toBe("Piet");
  });
  it("een lege naam wist niets", async () => {
    const s = await maakSjabloon("t1", invoer());
    await leggVast("t1", s, antwoord({ uitvoerder: "Piet" }), { bron: "link" });
    expect(await wisUitvoerder("t1", "  ")).toBe(0);
  });
  it("de lijst met namen telt per persoon, zonder wie al gewist is", async () => {
    const s = await maakSjabloon("t1", invoer());
    await leggVast("t1", s, antwoord({ uitvoerder: "Piet" }), { bron: "link" });
    await leggVast("t1", s, antwoord({ uitvoerder: "piet" }), { bron: "link" });
    await leggVast("t1", s, antwoord({ uitvoerder: "Anna" }), { bron: "link" });
    await leggVast("t1", s, antwoord({ uitvoerder: "Verwijderd" }), { bron: "link" });
    expect(await uitvoerderNamen("t1")).toEqual([{ naam: "Anna", aantal: 1 }, { naam: "Piet", aantal: 2 }]);
  });
});
