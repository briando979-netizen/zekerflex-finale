import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  celVeilig,
  dagNummer,
  duurMinuten,
  isDatum,
  isTijd,
  legePlanning,
  overlapt,
  plusDagen,
  urenCsv,
  urenPerMedewerker,
  waarschuwingen,
  weekMinuten,
  weekStart,
} from "@/lib/horeca-personeel/planning";
import {
  beoordeelRuil,
  beoordeelVerlof,
  biedDienstAan,
  bewaarUur,
  klokIn,
  klokUit,
  kopieerWeek,
  leesPlanningVan,
  meldNietBeschikbaar,
  neemOpenDienst,
  neemRuilAan,
  plaatsDienst,
  trekRuilIn,
  vraagVerlof,
  verwijderDienst,
  verwijderNietBeschikbaar,
  wijzigDienst,
} from "@/lib/horeca-personeel/planning-store";
import { bewaarDashboard, koppelAccount, nodigUit } from "@/lib/horeca-personeel/store";

// De planning van het eigen personeel: puur (datum en tijd, overlap, uren, csv) en de stromen met goedkeuring.

const T = "tenantAAAA1";

describe("datum en tijd", () => {
  it("herkent echte datums en tijden", () => {
    expect(isDatum("2026-11-15")).toBe(true);
    expect(isDatum("2026-02-30")).toBe(false);
    expect(isDatum("15-11-2026")).toBe(false);
    expect(isTijd("23:59")).toBe(true);
    expect(isTijd("24:00")).toBe(false);
    expect(isTijd("9:00")).toBe(false);
  });

  it("weken lopen van maandag; dagen optellen zonder zomertijd-sprongen", () => {
    expect(dagNummer("2026-11-15")).toBe(6); // zondag
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(plusDagen("2026-10-24", 3)).toBe("2026-10-27"); // over het einde van de zomertijd (25 okt)
    expect(plusDagen("2026-12-30", 3)).toBe("2027-01-02");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("de duur van een dienst, ook na middernacht", () => {
    expect(duurMinuten("09:00", "17:30")).toBe(510);
    expect(duurMinuten("18:00", "02:00")).toBe(480);
  });
});

describe("overlap en waarschuwingen", () => {
  const d = (datum: string, van: string, tot: string) => ({ datum, van, tot });
  it("overlap alleen op dezelfde datum en bij echt overlappende tijden", () => {
    expect(overlapt(d("2026-11-16", "09:00", "13:00"), d("2026-11-16", "12:00", "16:00"))).toBe(true);
    expect(overlapt(d("2026-11-16", "09:00", "13:00"), d("2026-11-16", "13:00", "16:00"))).toBe(false);
    expect(overlapt(d("2026-11-16", "18:00", "02:00"), d("2026-11-16", "23:00", "23:30"))).toBe(true);
    expect(overlapt(d("2026-11-16", "09:00", "13:00"), d("2026-11-17", "09:00", "13:00"))).toBe(false);
  });

  it("waarschuwt voor verlof, niet beschikbaar en overlap, maar niet voor een open dienst", () => {
    const p = legePlanning();
    p.verlof.push({ id: "v1", medewerkerId: "m1", van: "2026-11-16", tot: "2026-11-18", reden: "", status: "goedgekeurd", op: "" });
    p.verlof.push({ id: "v2", medewerkerId: "m1", van: "2026-11-20", tot: "2026-11-21", reden: "", status: "aangevraagd", op: "" });
    p.nietBeschikbaar.push({ id: "n1", medewerkerId: "m1", datum: "2026-11-19", notitie: "" });
    p.diensten.push({ id: "d1", medewerkerId: "m1", datum: "2026-11-22", van: "09:00", tot: "13:00", notitie: "" });
    const w = (datum: string, van = "10:00", tot = "12:00") => waarschuwingen(p, { medewerkerId: "m1", datum, van, tot });
    expect(w("2026-11-17")).toEqual(["verlof"]);
    expect(w("2026-11-19")).toEqual(["niet-beschikbaar"]);
    expect(w("2026-11-20")).toEqual([]); // alleen aangevraagd telt nog niet
    expect(w("2026-11-22")).toEqual(["overlap"]);
    expect(waarschuwingen(p, { medewerkerId: null, datum: "2026-11-17", van: "10:00", tot: "12:00" })).toEqual([]);
    // dezelfde dienst bij het wijzigen botst niet met zichzelf
    expect(waarschuwingen(p, { id: "d1", medewerkerId: "m1", datum: "2026-11-22", van: "09:00", tot: "13:00" })).toEqual([]);
  });
});

describe("uren en csv", () => {
  it("telt de geplande uren per week en de gewerkte uren per maand", () => {
    const p = legePlanning();
    p.diensten.push({ id: "a", medewerkerId: "m1", datum: "2026-11-09", van: "09:00", tot: "17:00", notitie: "" }, { id: "b", medewerkerId: "m1", datum: "2026-11-16", van: "09:00", tot: "13:00", notitie: "" });
    expect(weekMinuten(p, "m1", "2026-11-09")).toBe(480);
    p.uren.push({ id: "u1", medewerkerId: "m1", datum: "2026-11-09", in: "09:00", uit: "17:30", bron: "klok" }, { id: "u2", medewerkerId: "m1", datum: "2026-11-10", in: "10:00", uit: null, bron: "klok" });
    expect(urenPerMedewerker(p, "2026-11").get("m1")).toBe(510);
  });

  it("de csv heeft een komma als decimaalteken en maakt een formule onschadelijk", () => {
    const p = legePlanning();
    p.uren.push({ id: "u1", medewerkerId: "m1", datum: "2026-11-09", in: "09:00", uit: "17:30", bron: "klok" });
    const csv = urenCsv(p, "2026-11", () => "=HYPERLINK(\"x\")");
    expect(csv.split("\r\n")[0]).toBe("Medewerker;Datum;Van;Tot;Uren");
    expect(csv).toContain("8,50");
    expect(csv).not.toMatch(/^=/m);
    expect(celVeilig("a;b")).toBe('"a;b"');
    expect(celVeilig("+1")).toBe("'+1");
  });
});

async function team() {
  await bewaarDashboard(T, { naam: "Zaal", blokken: ["taken"] });
  const a = await nodigUit(T, "Zaak", { naam: "Piet", email: "piet@voorbeeld.test", functie: "", dashboardId: "d1" });
  const b = await nodigUit(T, "Zaak", { naam: "Els", email: "els@voorbeeld.test", functie: "", dashboardId: "d1" });
  await koppelAccount(T, a.medewerker.id, "u1");
  await koppelAccount(T, b.medewerker.id, "u2");
  return { a: a.medewerker.id, b: b.medewerker.id };
}

beforeEach(() => m.kv.clear());

describe("rooster", () => {
  it("plant, wijzigt en verwijdert; een onbekende of gestopte medewerker kan niet", async () => {
    const { a } = await team();
    const r = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-16", van: "09:00", tot: "17:00", notitie: " opening " });
    expect(r.dienst.notitie).toBe("opening");
    expect(r.waarschuwingen).toEqual([]);
    await expect(plaatsDienst(T, { medewerkerId: "nee", datum: "2026-11-16", van: "09:00", tot: "17:00", notitie: "" })).rejects.toThrow(/actief/);
    await expect(plaatsDienst(T, { medewerkerId: a, datum: "2026-13-16", van: "09:00", tot: "17:00", notitie: "" })).rejects.toThrow(/datum/);
    await expect(plaatsDienst(T, { medewerkerId: a, datum: "2026-11-16", van: "09:00", tot: "09:00", notitie: "" })).rejects.toThrow(/gelijk/);
    const w = await wijzigDienst(T, r.dienst.id, { van: "10:00" });
    expect(w.planning.diensten[0]?.van).toBe("10:00");
    expect((await verwijderDienst(T, r.dienst.id)).diensten).toEqual([]);
  });

  it("geeft een waarschuwing bij een tweede dienst die overlapt", async () => {
    const { a } = await team();
    await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-16", van: "09:00", tot: "13:00", notitie: "" });
    const r = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-16", van: "12:00", tot: "16:00", notitie: "" });
    expect(r.waarschuwingen).toEqual(["overlap"]);
  });

  it("kopieert een week en maakt geen dubbelen", async () => {
    const { a } = await team();
    await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-16", van: "09:00", tot: "13:00", notitie: "" });
    await plaatsDienst(T, { medewerkerId: null, datum: "2026-11-18", van: "18:00", tot: "23:00", notitie: "" });
    const eerste = await kopieerWeek(T, "2026-11-16", "2026-11-23");
    expect(eerste.aantal).toBe(2);
    expect(eerste.planning.diensten.map((d) => d.datum).sort()).toEqual(["2026-11-16", "2026-11-18", "2026-11-23", "2026-11-25"]);
    expect((await kopieerWeek(T, "2026-11-16", "2026-11-23")).aantal).toBe(0);
    await expect(kopieerWeek(T, "2026-11-16", "2026-11-16")).rejects.toThrow(/andere week/);
  });
});

describe("niet beschikbaar", () => {
  it("een medewerker meldt en verwijdert alleen zijn eigen regel", async () => {
    const { a, b } = await team();
    await meldNietBeschikbaar(T, a, { datum: "2026-11-19", notitie: "tentamen" });
    const dubbel = await meldNietBeschikbaar(T, a, { datum: "2026-11-19", notitie: "" });
    expect(dubbel.nietBeschikbaar).toHaveLength(1);
    const id = dubbel.nietBeschikbaar[0]!.id;
    expect((await verwijderNietBeschikbaar(T, b, id)).nietBeschikbaar).toHaveLength(1);
    expect((await verwijderNietBeschikbaar(T, a, id)).nietBeschikbaar).toHaveLength(0);
  });
});

describe("ruilen en open diensten", () => {
  const NU = new Date("2026-11-15T10:00:00Z");

  it("aanbieden, aannemen en goedkeuren zet de dienst op de ander", async () => {
    const { a, b } = await team();
    const { dienst } = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-20", van: "09:00", tot: "13:00", notitie: "" });
    await biedDienstAan(T, a, dienst.id, null, NU);
    const ruil = (await leesPlanningVan(T)).ruilen[0]!;
    await expect(neemRuilAan(T, a, ruil.id)).rejects.toThrow(/eigen dienst/);
    await neemRuilAan(T, b, ruil.id);
    expect((await leesPlanningVan(T)).ruilen[0]?.status).toBe("geaccepteerd");
    const r = await beoordeelRuil(T, ruil.id, "goedkeuren");
    expect(r.planning.diensten[0]?.medewerkerId).toBe(b);
    expect(r.planning.ruilen[0]?.status).toBe("goedgekeurd");
    await expect(beoordeelRuil(T, ruil.id, "goedkeuren")).rejects.toThrow(/wacht niet/);
  });

  it("een aanbod aan één collega kan een ander niet aannemen; een dienst die niet van jou is kun je niet aanbieden", async () => {
    const { a, b } = await team();
    const { dienst } = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-20", van: "09:00", tot: "13:00", notitie: "" });
    await expect(biedDienstAan(T, b, dienst.id, null, NU)).rejects.toThrow(/niet van jou/);
    await biedDienstAan(T, a, dienst.id, b, NU);
    const ruil = (await leesPlanningVan(T)).ruilen[0]!;
    await expect(neemRuilAan(T, "u-onbekend", ruil.id)).rejects.toThrow(/collega/);
    await expect(biedDienstAan(T, a, dienst.id, null, NU)).rejects.toThrow(/loopt al/);
  });

  it("een dienst in het verleden kun je niet meer aanbieden", async () => {
    const { a } = await team();
    const { dienst } = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-10", van: "09:00", tot: "13:00", notitie: "" });
    await expect(biedDienstAan(T, a, dienst.id, null, NU)).rejects.toThrow(/verleden/);
  });

  it("een open dienst nemen vraagt goedkeuring; afwijzen laat hem open; een tweede aanvraag kan niet", async () => {
    const { b } = await team();
    const { dienst } = await plaatsDienst(T, { medewerkerId: null, datum: "2026-11-20", van: "18:00", tot: "23:00", notitie: "" });
    await neemOpenDienst(T, b, dienst.id, NU);
    await expect(neemOpenDienst(T, b, dienst.id, NU)).rejects.toThrow(/al gemeld/);
    const ruil = (await leesPlanningVan(T)).ruilen[0]!;
    const af = await beoordeelRuil(T, ruil.id, "afwijzen");
    expect(af.planning.diensten[0]?.medewerkerId).toBeNull();
    expect(af.planning.ruilen[0]?.status).toBe("afgewezen");
  });

  it("intrekken kan alleen door de aanvrager; een goedgekeurd verzoek niet meer", async () => {
    const { a, b } = await team();
    const { dienst } = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-20", van: "09:00", tot: "13:00", notitie: "" });
    await biedDienstAan(T, a, dienst.id, null, NU);
    const ruil = (await leesPlanningVan(T)).ruilen[0]!;
    await trekRuilIn(T, b, ruil.id);
    expect((await leesPlanningVan(T)).ruilen[0]?.status).toBe("aangeboden");
    await trekRuilIn(T, a, ruil.id);
    expect((await leesPlanningVan(T)).ruilen[0]?.status).toBe("ingetrokken");
  });

  it("een dienst van eigenaar veranderen laat een lopend verzoek vervallen", async () => {
    const { a, b } = await team();
    const { dienst } = await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-20", van: "09:00", tot: "13:00", notitie: "" });
    await biedDienstAan(T, a, dienst.id, null, NU);
    await wijzigDienst(T, dienst.id, { medewerkerId: b });
    expect((await leesPlanningVan(T)).ruilen[0]?.status).toBe("ingetrokken");
  });
});

describe("verlof", () => {
  const NU = new Date("2026-11-15T10:00:00Z");
  it("aanvragen, goedkeuren en daarna waarschuwt het rooster", async () => {
    const { a } = await team();
    await vraagVerlof(T, a, { van: "2026-12-21", tot: "2026-12-27", reden: "vakantie" }, NU);
    await expect(vraagVerlof(T, a, { van: "2026-12-25", tot: "2026-12-30", reden: "" }, NU)).rejects.toThrow(/al verlof/);
    await expect(vraagVerlof(T, a, { van: "2026-12-30", tot: "2026-12-29", reden: "" }, NU)).rejects.toThrow(/laatste dag/);
    await expect(vraagVerlof(T, a, { van: "2026-01-01", tot: "2026-06-01", reden: "" }, NU)).rejects.toThrow(/60 dagen/);
    const id = (await leesPlanningVan(T)).verlof[0]!.id;
    await beoordeelVerlof(T, id, "goedkeuren");
    const r = await plaatsDienst(T, { medewerkerId: a, datum: "2026-12-23", van: "09:00", tot: "13:00", notitie: "" });
    expect(r.waarschuwingen).toEqual(["verlof"]);
    await expect(beoordeelVerlof(T, id, "afwijzen")).rejects.toThrow(/wacht niet/);
  });
});

describe("uren", () => {
  it("inklokken en uitklokken met de Amsterdamse tijd; twee keer inklokken kan niet", async () => {
    const { a } = await team();
    await klokIn(T, a, new Date("2026-11-16T08:02:00Z")); // 09:02 in Amsterdam
    await expect(klokIn(T, a)).rejects.toThrow(/al ingeklokt/);
    const p = await klokUit(T, a, new Date("2026-11-16T16:30:00Z")); // 17:30
    expect(p.uren[0]).toMatchObject({ datum: "2026-11-16", in: "09:02", uit: "17:30", bron: "klok" });
    await expect(klokUit(T, a)).rejects.toThrow(/niet ingeklokt/);
  });

  it("de beheerder voegt een regel toe en corrigeert hem", async () => {
    const { a } = await team();
    const p1 = await bewaarUur(T, { medewerkerId: a, datum: "2026-11-16", in: "09:00", uit: "17:00" });
    const id = p1.uren[0]!.id;
    const p2 = await bewaarUur(T, { id, medewerkerId: a, datum: "2026-11-16", in: "09:00", uit: "17:30" });
    expect(p2.uren).toHaveLength(1);
    expect(p2.uren[0]).toMatchObject({ uit: "17:30", bron: "beheer" });
    await expect(bewaarUur(T, { medewerkerId: "nee", datum: "2026-11-16", in: "09:00", uit: null })).rejects.toThrow(/niet in je lijst/);
    await expect(bewaarUur(T, { medewerkerId: a, datum: "kapot", in: "09:00", uit: null })).rejects.toThrow(/goed in/);
  });
});

describe("opslag", () => {
  it("een ander bedrijf ziet niets, en rommel in de opslag geeft een lege planning", async () => {
    const { a } = await team();
    await plaatsDienst(T, { medewerkerId: a, datum: "2026-11-16", van: "09:00", tot: "17:00", notitie: "" });
    expect((await leesPlanningVan("tenantBBBB2")).diensten).toEqual([]);
    m.kv.set(`horeca:planning:${T}`, { versie: 9, rommel: true });
    expect((await leesPlanningVan(T)).diensten).toEqual([]);
  });
});
