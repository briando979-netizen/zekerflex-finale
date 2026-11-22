import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGE_GEGEVENS,
  bureauMeldingen,
  dagenTot,
  isTeLaat,
  leesBureauGegevens,
  recenteWeken,
  sorteerAanvragen,
  stapVan,
  totalenPerWerker,
  verloningCsv,
  weekGrenzen,
  weekTekst,
  weekVan,
  werkdagenSinds,
  type BureauGegevens,
  type VerloningDienst,
} from "@/lib/uitzend/bureau-kern";
import { PARTNER_VOORWAARDEN_VERSIE } from "@/lib/uitzend/voorwaarden";
import { UITZEND_SLEUTELS, menuVoor, type MenuOpties } from "@/lib/werkgever/werkruimte";
import { pasMenuVolgordeToe } from "@/lib/werkgever/menu-volgorde";
import { fmt, nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Het dashboard van een uitzendpartner (21 nov 2026, eigenaar: "bouw van 1 tot 5"): aanvragen, uitzendkrachten, uren voor de
// verloning, klanten en locaties, bureaugegevens. Alle datums met een zone, "nu" wordt doorgegeven: geen tijdbom.

const ROOT = process.cwd();
const lees = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const d = (s: string) => new Date(s);

describe("aanvragen: stap, werkdagen en te laat", () => {
  it("de stap volgt de status van de reactie, en gebeld telt alleen bij een open aanvraag", () => {
    expect(stapVan("pending", null)).toBe("nieuw");
    expect(stapVan("pending", "2026-11-17T09:00:00.000Z")).toBe("gebeld");
    expect(stapVan("accepted", "2026-11-17T09:00:00.000Z")).toBe("ingepland");
    expect(stapVan("declined", null)).toBe("afgewezen");
    expect(stapVan("withdrawn", null)).toBe("ingetrokken");
    expect(stapVan("expired", null)).toBe("verlopen");
  });

  it("telt werkdagen in Nederlandse tijd, zonder het weekend", () => {
    // maandag 16 nov 2026 → woensdag 18 nov: dinsdag en woensdag
    expect(werkdagenSinds(d("2026-11-16T10:00:00+01:00"), d("2026-11-18T09:00:00+01:00"))).toBe(2);
    // vrijdagmiddag → maandag: alleen maandag
    expect(werkdagenSinds(d("2026-11-20T16:00:00+01:00"), d("2026-11-23T10:00:00+01:00"))).toBe(1);
    // maandag 23:30 → dinsdag 00:30 Nederlandse tijd (in UTC nog maandag): een nieuwe werkdag
    expect(werkdagenSinds(d("2026-11-16T23:30:00+01:00"), d("2026-11-17T00:30:00+01:00"))).toBe(1);
    expect(werkdagenSinds(d("2026-11-16T10:00:00+01:00"), d("2026-11-16T18:00:00+01:00"))).toBe(0);
  });

  it("te laat: een nieuwe aanvraag na meer dan 2 werkdagen; gebeld of afgehandeld nooit", () => {
    const maandag = d("2026-11-16T10:00:00+01:00");
    expect(isTeLaat("nieuw", maandag, d("2026-11-18T17:00:00+01:00"))).toBe(false);
    expect(isTeLaat("nieuw", maandag, d("2026-11-19T08:00:00+01:00"))).toBe(true);
    expect(isTeLaat("gebeld", maandag, d("2026-11-25T08:00:00+01:00"))).toBe(false);
    expect(isTeLaat("ingepland", maandag, d("2026-11-25T08:00:00+01:00"))).toBe(false);
  });

  it("open aanvragen eerst, de oudste bovenaan; daarna de rest, de nieuwste eerst", () => {
    const rijen = [
      { id: "a", stap: "afgewezen" as const, at: "2026-11-10T09:00:00.000Z" },
      { id: "b", stap: "nieuw" as const, at: "2026-11-18T09:00:00.000Z" },
      { id: "c", stap: "gebeld" as const, at: "2026-11-15T09:00:00.000Z" },
      { id: "d", stap: "ingepland" as const, at: "2026-11-12T09:00:00.000Z" },
    ];
    expect(sorteerAanvragen(rijen).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("weken voor de verloning", () => {
  it("ISO-week in Nederlandse tijd, ook rond middernacht op zondag", () => {
    expect(weekVan(d("2026-11-21T12:00:00+01:00"))).toBe("2026-W47");
    expect(weekVan(d("2026-11-22T23:30:00+01:00"))).toBe("2026-W47");
    // maandag 00:30 Nederlandse tijd is in UTC nog zondag
    expect(weekVan(d("2026-11-23T00:30:00+01:00"))).toBe("2026-W48");
  });

  it("begin en eind van een week, ook met de overgang naar zomertijd", () => {
    expect(weekGrenzen("2026-W47")).toEqual({ van: d("2026-11-16T00:00:00+01:00"), tot: d("2026-11-23T00:00:00+01:00") });
    // 29 maart 2026: zomertijd; de week begint in wintertijd en eindigt in zomertijd
    expect(weekGrenzen("2026-W13")).toEqual({ van: d("2026-03-23T00:00:00+01:00"), tot: d("2026-03-30T00:00:00+02:00") });
  });

  it("week 53 alleen in een jaar dat hem heeft; onzin geeft null", () => {
    expect(weekGrenzen("2026-W53")?.van).toEqual(d("2026-12-28T00:00:00+01:00"));
    expect(weekGrenzen("2025-W53")).toBeNull();
    for (const fout of ["", "2026-47", "2026-W00", "2026-W54", "abc", "1999-W10"]) expect(weekGrenzen(fout), fout).toBeNull();
  });

  it("de laatste weken, de huidige eerst, en leesbaar", () => {
    expect(recenteWeken(d("2026-11-21T12:00:00+01:00"), 3)).toEqual(["2026-W47", "2026-W46", "2026-W45"]);
    expect(weekTekst("2026-W47")).toMatch(/^16 nov\.? – 22 nov\.? 2026$/);
  });
});

describe("uren voor de verloning", () => {
  const dienst = (o: Partial<VerloningDienst>): VerloningDienst => ({
    werkerId: "w1",
    naam: "Sem Visser",
    email: "sem@zekerflex.test",
    locatie: "Bakkerij De Vries",
    klus: "Inpakker",
    begin: d("2026-11-17T09:00:00+01:00"),
    eind: d("2026-11-17T13:30:00+01:00"),
    pauzeMinuten: 30,
    minuten: 240,
    uurloonCents: 1500,
    ...o,
  });

  it("telt per uitzendkracht op: diensten, minuten, bruto en de locaties", () => {
    const t = totalenPerWerker([dienst({}), dienst({ minuten: 120, locatie: "Garage Bos" }), dienst({ werkerId: "w2", naam: "Anna de Boer", minuten: 60 })]);
    expect(t.map((x) => x.naam)).toEqual(["Anna de Boer", "Sem Visser"]);
    expect(t[1]).toMatchObject({ diensten: 2, minuten: 360, brutoCents: 9000, locaties: ["Bakkerij De Vries", "Garage Bos"] });
  });

  it("CSV voor Excel: BOM, puntkomma, Nederlandse tijd, en geen formules", () => {
    const csv = verloningCsv("2026-W47", [dienst({ naam: "=HYPERLINK(\"x\")", klus: "Inpakken; snel" })]);
    expect(csv.startsWith("﻿Week;Datum;Uitzendkracht;")).toBe(true);
    const regel = csv.split("\r\n")[1] ?? "";
    expect(regel).toContain("2026-W47;17-11-2026;");
    expect(regel).toContain(`"'=HYPERLINK(""x"")"`);
    expect(regel).toContain('"Inpakken; snel";09:00;13:30;30;4,00;15,00;60,00');
  });
});

describe("bureaugegevens en meldingen", () => {
  const nu = d("2026-11-21T12:00:00+01:00");
  const compleet: BureauGegevens = {
    uitlener: true,
    keurmerk: "sna",
    keurmerkTot: "2027-06-01",
    cao: "abu",
    verzekeringTot: "2027-01-31",
    loonheffingennummer: "123456789L01",
    akkoord: { versie: PARTNER_VOORWAARDEN_VERSIE, op: "2026-11-21T10:00:00.000Z", door: "u1" },
    bijgewerkt: "2026-11-21T10:00:00.000Z",
  };

  it("een nieuw bureau moet eerst akkoord geven en zijn toelating invullen", () => {
    const m = bureauMeldingen(LEGE_GEGEVENS, nu);
    expect(m[0]?.ernst).toBe("crit");
    expect(m.map((x) => x.tekst).join(" ")).toContain("partnervoorwaarden nog niet geaccepteerd");
    expect(m.filter((x) => x.ernst === "crit")).toHaveLength(3);
  });

  it("alles in orde: geen meldingen; 30 dagen van tevoren een waarschuwing, verlopen is ernstig", () => {
    expect(bureauMeldingen(compleet, nu)).toEqual([]);
    expect(bureauMeldingen({ ...compleet, keurmerkTot: "2026-12-10" }, nu)).toEqual([{ ernst: "warn", tekst: expect.stringContaining("verloopt over 19 dagen") }]);
    expect(bureauMeldingen({ ...compleet, verzekeringTot: "2026-11-20" }, nu)[0]).toMatchObject({ ernst: "crit", tekst: expect.stringContaining("is verlopen op 20 november 2026") });
    expect(bureauMeldingen({ ...compleet, akkoord: { ...compleet.akkoord!, versie: "2025-01" } }, nu)[0]?.tekst).toContain("nieuwe versie");
  });

  it("dagen tot een datum in de Nederlandse kalender", () => {
    expect(dagenTot("2026-11-22", d("2026-11-21T23:30:00+01:00"))).toBe(1);
    expect(dagenTot("2026-11-21", d("2026-11-21T00:10:00+01:00"))).toBe(0);
  });

  it("bewaarde gegevens soepel inlezen", () => {
    expect(leesBureauGegevens(null)).toEqual(LEGE_GEGEVENS);
    expect(leesBureauGegevens({ keurmerk: "iets", cao: 3, keurmerkTot: "morgen", uitlener: "ja" })).toEqual(LEGE_GEGEVENS);
    expect(leesBureauGegevens(compleet)).toEqual(compleet);
  });
});

describe("het menu Uitzendbureau", () => {
  const opties: MenuOpties = { inApp: false };

  it("alleen bij een uitzendpartner, als eigen blok tussen het hoofddeel en Beheer", () => {
    const zonder = menuVoor(opties).map((p) => p.sleutel);
    for (const s of UITZEND_SLEUTELS) expect(zonder).not.toContain(s);
    const met = menuVoor({ ...opties, uitzendPartner: true });
    const blok = met.filter((p) => p.sectie === "uitzend").map((p) => p.sleutel);
    expect(blok).toEqual([...UITZEND_SLEUTELS]);
    const i = met.findIndex((p) => p.sectie === "uitzend");
    expect(met[i - 1]?.sectie).toBeUndefined();
    expect(met[i + UITZEND_SLEUTELS.length]?.sectie).toBe("beheer");
  });

  it("blijft staan met de vlag alleen-flexwerk, ook vóór de eerste klus, en met een eigen menuvolgorde", () => {
    const flex = menuVoor({ ...opties, uitzendPartner: true, alleenFlexwerk: true, nogGeenKlussen: true });
    expect(flex.filter((p) => p.sectie === "uitzend").map((p) => p.sleutel)).toEqual([...UITZEND_SLEUTELS]);
    const gesorteerd = pasMenuVolgordeToe(flex, { hoofd: ["berichten", "klussen"], beheer: ["facturen", "uren"] });
    const i = gesorteerd.findIndex((p) => p.sectie === "uitzend");
    expect(gesorteerd.slice(i, i + UITZEND_SLEUTELS.length).every((p) => p.sectie === "uitzend")).toBe(true);
    expect(gesorteerd.slice(i + UITZEND_SLEUTELS.length).every((p) => p.sectie !== undefined)).toBe(true);
  });

  it("elk onderdeel heeft een adres onder /werkgever/uitzend met een bestaande pagina", () => {
    const layout = lees("app/werkgever/layout.tsx");
    expect(layout).toContain("uitzendPartner,");
    for (const s of UITZEND_SLEUTELS) {
      const m = new RegExp(`${s}: \\{ href: "(/werkgever/uitzend[^"]*)"`).exec(layout);
      expect(m, s).not.toBeNull();
      const pad = m?.[1] ?? "";
      expect(existsSync(path.join(ROOT, `app${pad}/page.tsx`)), pad).toBe(true);
    }
  });
});

describe("de tekst staat in het werkgeverswoordenboek, in het Nederlands en Engels (uitzendBureau)", () => {
  const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");
  const plat = (o: object, pad = ""): [string, string][] =>
    Object.entries(o).flatMap(([k, v]): [string, string][] => (typeof v === "string" ? [[`${pad}${k}`, v]] : plat(v as object, `${pad}${k}.`)));

  it("Engels heeft dezelfde sleutels en plaatshouders en is echt vertaald", () => {
    const a = new Map(plat(nl.uitzendBureau));
    const b = new Map(plat(en.uitzendBureau));
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [k, tekst] of a) {
      const x = b.get(k) ?? "";
      expect(x.length, k).toBeGreaterThan(0);
      expect(plaats(x), `${k} plaatshouders`).toBe(plaats(tekst));
      if (tekst.split(/\s+/).length >= 6) expect(x, `${k} is niet vertaald`).not.toBe(tekst);
    }
  });

  it("elke stap heeft een label en het Nederlands is gelijk aan wat er stond", () => {
    const u = nl.uitzendBureau;
    expect(Object.keys(u.stap).sort()).toEqual(["afgewezen", "gebeld", "ingepland", "ingetrokken", "nieuw", "verlopen"]);
    expect(u.stap.ingepland).toBe("Contract rond, ingepland");
    expect(fmt(u.aanvragen.wachtAl, { n: 3 })).toBe("Wacht al 3 werkdagen");
    expect(fmt(u.bureau.uitleg, { naam: "Bureau Zon", datum: "21 november 2026", kvk: fmt(u.bureau.kvk, { nummer: "12345678" }), dagen: 30 })).toBe(
      "Bureau Zon is uitzendpartner sinds 21 november 2026 · KVK 12345678. Houd deze gegevens actueel: we waarschuwen je 30 dagen voordat iets verloopt.",
    );
    expect(weekTekst("2026-W47", en.uitzendBureau.intl)).toMatch(/^16 Nov – 22 Nov 2026$/);
  });

  it("de schermen halen hun tekst uit het woordenboek: pagina's met getDict, de knoppen en het formulier met useT", () => {
    for (const p of ["", "/krachten", "/verloning", "/klanten", "/bureau"]) expect(lees(`app/werkgever/uitzend${p}/page.tsx`), p).toContain("getDict()");
    expect(lees("components/werkgever/uitzend/BureauKop.tsx")).toContain("(await getDict()).uitzendBureau");
    expect(lees("components/werkgever/uitzend/AanvraagKnoppen.tsx")).toContain("useT().uitzendBureau.knoppen");
    expect(lees("components/werkgever/uitzend/BureauGegevensForm.tsx")).toContain("useT().uitzendBureau");
  });
});

describe("toegang en privacy", () => {
  it("elk scherm toont alleen iets aan een uitzendpartner", () => {
    for (const p of ["", "/krachten", "/verloning", "/klanten", "/bureau"]) {
      const bron = lees(`app/werkgever/uitzend${p}/page.tsx`);
      expect(bron, p).toContain("if (!ctx.tenantId || !ctx.partnerSinds)");
      expect(bron, p).toContain("<GeenUitzendPartner />");
    }
    for (const r of ["gebeld", "bureau", "verloning"]) expect(lees(`app/api/werkgever/uitzend/${r}/route.ts`), r).toContain("!ctx.partnerSinds");
  });

  it("gebeld alleen bij een eigen aanvraag, de bureaugegevens alleen door de hoofdbeheerder", () => {
    expect(lees("app/api/werkgever/uitzend/gebeld/route.ts")).toContain("isEigenAanvraag(ctx, parsed.data.offerId)");
    expect(lees("app/api/werkgever/uitzend/bureau/route.ts")).toContain('requireRole(ctx.principal, "HQ_ADMIN", "PLATFORM_ADMIN")');
  });

  it("contactgegevens alleen met toestemming: open of ingepland, en van ná het moment dat het bureau partner werd", () => {
    const bron = lees("lib/uitzend/bureau.ts");
    expect(bron).toContain('Boolean(ctx.partnerSinds && r.at >= ctx.partnerSinds) && (isOpen(stap) || stap === "ingepland")');
    expect(bron).toContain("email: metToestemming ?");
    expect(bron).toContain("telefoon: metToestemming ?");
  });
});
