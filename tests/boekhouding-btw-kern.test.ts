import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controleerBtw, heeftBlokkade, type ControleInvoer, type ControleRegel } from "@/lib/boekhouding/btw/controle";
import { berekenBtw, btwDeadlineDag, conceptNaarCsv, grondslagInEuro } from "@/lib/boekhouding/btw/kern";
import { RUBRIEK_VOLGORDE } from "@/lib/boekhouding/btw/labels";
import { jaarKeuzes, standaardKwartaal } from "@/lib/boekhouding/btw/scherm-kern";
import type { BtwRegel } from "@/lib/boekhouding/lezen-kern";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-04-10T10:00:00+02:00"));
});
afterEach(() => vi.useRealTimers());

const verkoop = (grondslag: string | null, btw: string | null) => ({ richting: "VERKOOP" as const, grondslagRubriek: grondslag, btwRubriek: btw });
const inkoop = (grondslag: string | null, btw: string | null) => ({ richting: "INKOOP" as const, grondslagRubriek: grondslag, btwRubriek: btw });

/** Een verkoop met omzetregel (grondslag) en btw-regel; `terug` draait de kanten om (tegenboeking). */
function verkoopRegels(rubriek: string, basis: number, btw: number, terug = false): BtwRegel[] {
  const kant = (c: number) => (terug ? { debetCents: c, creditCents: 0 } : { debetCents: 0, creditCents: c });
  return [
    { ...kant(basis), isBtwRegel: false, btwBasisCents: basis, ...verkoop(rubriek, rubriek) },
    ...(btw > 0 ? [{ ...kant(btw), isBtwRegel: true, btwBasisCents: null, ...verkoop(rubriek, rubriek) }] : []),
  ];
}

const rij = (r: ReturnType<typeof berekenBtw>, nummer: string) => {
  const x = r.rubrieken.find((y) => y.rubriek === nummer);
  if (!x) throw new Error(`rubriek ${nummer} ontbreekt`);
  return x;
};

describe("berekenBtw", () => {
  it("een kwartaal met hoog, laag, 0% en verlegd", () => {
    const regels: BtwRegel[] = [
      ...verkoopRegels("1a", 100000, 21000),
      ...verkoopRegels("1b", 50050, 4505),
      { debetCents: 0, creditCents: 20000, isBtwRegel: false, btwBasisCents: 20000, ...verkoop("1e", null) },
      // inkoop 21%: kosten met grondslag zonder rubriek, btw naar 5b
      { debetCents: 10000, creditCents: 0, isBtwRegel: false, btwBasisCents: 10000, ...inkoop(null, "5b") },
      { debetCents: 2100, creditCents: 0, isBtwRegel: true, btwBasisCents: null, ...inkoop(null, "5b") },
      // verlegd uit de EU: eigen btw in 4b en dezelfde btw als voorbelasting in 5b
      { debetCents: 0, creditCents: 2381, isBtwRegel: false, btwBasisCents: 2381, ...verkoop("4b", "4b") },
      { debetCents: 0, creditCents: 500, isBtwRegel: true, btwBasisCents: null, ...verkoop("4b", "4b") },
      { debetCents: 500, creditCents: 0, isBtwRegel: true, btwBasisCents: null, ...inkoop(null, "5b") },
    ];
    const r = berekenBtw(regels);
    expect(rij(r, "1a")).toMatchObject({ grondslagCents: 100000, grondslagEuro: 1000, btwCents: 21000 });
    expect(rij(r, "1b")).toMatchObject({ grondslagCents: 50050, grondslagEuro: 500, btwCents: 4505 });
    expect(rij(r, "1e")).toMatchObject({ grondslagCents: 20000, grondslagEuro: 200, btwCents: 0 });
    expect(rij(r, "4b")).toMatchObject({ grondslagCents: 2381, grondslagEuro: 23, btwCents: 500 });
    expect(r.verschuldigdCents).toBe(21000 + 4505 + 500);
    expect(r.voorbelastingCents).toBe(2600);
    expect(r.saldoCents).toBe(23405);
    expect(rij(r, "5a").btwCents).toBe(26005);
    expect(rij(r, "5b").btwCents).toBe(2600);
    expect(rij(r, "5c").btwCents).toBe(23405);
    expect(rij(r, "5c").grondslagCents).toBeNull();
    expect(r.onbekendeRubrieken).toEqual([]);
  });

  it("alle rubrieken staan er altijd in, in vaste volgorde, en elke is door een accountant te bevestigen", () => {
    const r = berekenBtw([]);
    expect(r.rubrieken.map((x) => x.rubriek)).toEqual([...RUBRIEK_VOLGORDE]);
    expect(r.rubrieken.every((x) => x.doorAccountantTeBevestigen)).toBe(true);
    expect(r.voorbehouden.map((v) => v.onderwerp)).toContain("Kleine-ondernemersregeling (KOR)");
  });

  it("een lege periode geeft overal nul", () => {
    const r = berekenBtw([]);
    expect(r.saldoCents).toBe(0);
    expect(r.rubrieken.every((x) => x.btwCents === 0 && (x.grondslagCents ?? 0) === 0)).toBe(true);
  });

  it("een tegenboeking haalt de bedragen weg", () => {
    const r = berekenBtw([...verkoopRegels("1a", 100000, 21000), ...verkoopRegels("1a", 100000, 21000, true)]);
    expect(rij(r, "1a")).toMatchObject({ grondslagCents: 0, grondslagEuro: 0, btwCents: 0 });
    expect(r.saldoCents).toBe(0);
  });

  it("een gedeeltelijke tegenboeking laat het restant staan", () => {
    const r = berekenBtw([...verkoopRegels("1a", 100000, 21000), ...verkoopRegels("1a", 40000, 8400, true)]);
    expect(rij(r, "1a")).toMatchObject({ grondslagCents: 60000, btwCents: 12600 });
  });

  it("btw naar een rubriek die niet bestaat wordt gemeld in plaats van weggegooid", () => {
    const r = berekenBtw([{ debetCents: 0, creditCents: 100, isBtwRegel: true, btwBasisCents: null, ...verkoop(null, "9z") }]);
    expect(r.onbekendeRubrieken).toEqual(["9z"]);
    expect(r.saldoCents).toBe(0);
  });

  it("btw in een rubriek zonder btw (1e) of grondslag in 5b telt als onbekend", () => {
    const r = berekenBtw([
      { debetCents: 0, creditCents: 100, isBtwRegel: true, btwBasisCents: null, ...verkoop(null, "1e") },
      { debetCents: 0, creditCents: 100, isBtwRegel: false, btwBasisCents: 100, ...verkoop("5b", null) },
    ]);
    expect(r.onbekendeRubrieken).toEqual(["1e", "5b"]);
  });

  it("verkoop aan EU-bedrijven (3b) zet een voorbehoud voor de opgaaf ICP", () => {
    const r = berekenBtw([{ debetCents: 0, creditCents: 50000, isBtwRegel: false, btwBasisCents: 50000, ...verkoop("3b", null) }]);
    expect(r.voorbehouden.map((v) => v.onderwerp)).toContain("Opgaaf ICP");
    expect(berekenBtw([]).voorbehouden.map((v) => v.onderwerp)).not.toContain("Opgaaf ICP");
  });
});

describe("grondslagInEuro", () => {
  it("rondt naar beneden af op hele euro's, richting nul bij negatief, nooit -0", () => {
    expect(grondslagInEuro(12399)).toBe(123);
    expect(grondslagInEuro(12300)).toBe(123);
    expect(grondslagInEuro(99)).toBe(0);
    expect(grondslagInEuro(-250)).toBe(-2);
    expect(Object.is(grondslagInEuro(-50), -0)).toBe(false);
  });
});

describe("btwDeadlineDag", () => {
  it("is de laatste dag van de maand na het kwartaal, ook voor een verstreken kwartaal", () => {
    expect(btwDeadlineDag(2026, 1)).toBe("2026-04-30");
    expect(btwDeadlineDag(2026, 2)).toBe("2026-07-31");
    expect(btwDeadlineDag(2026, 3)).toBe("2026-10-31");
    expect(btwDeadlineDag(2026, 4)).toBe("2027-01-31");
    expect(btwDeadlineDag(2024, 1)).toBe("2024-04-30");
  });
});

describe("conceptNaarCsv", () => {
  it("heeft een kopregel, komma's als decimaalteken en geen grondslag bij 5a/5b/5c", () => {
    const r = berekenBtw(verkoopRegels("1a", 100000, 21000));
    const csv = conceptNaarCsv(r.rubrieken);
    const regels = csv.replace("﻿", "").split("\r\n");
    expect(regels[0]).toBe("Rubriek;Omschrijving;Grondslag (hele euro's);Btw (euro)");
    expect(regels).toContain("1a;Leveringen en diensten, hoog tarief (21%);1000;210,00");
    expect(regels).toContain("5c;Saldo: te betalen of terug te vragen;;210,00");
    expect(csv).toContain("concept en geen aangifte");
  });

  it("zet een negatief saldo met min-teken", () => {
    const r = berekenBtw([{ debetCents: 1234, creditCents: 0, isBtwRegel: true, btwBasisCents: null, ...inkoop(null, "5b") }]);
    expect(conceptNaarCsv(r.rubrieken)).toContain("5c;Saldo: te betalen of terug te vragen;;-12,34");
  });
});

describe("scherm-kern", () => {
  it("het standaardkwartaal is het laatst afgesloten kwartaal op de Amsterdamse dag", () => {
    expect(standaardKwartaal(new Date("2026-04-10T10:00:00+02:00"))).toEqual({ jaar: 2026, kwartaal: 1 });
    expect(standaardKwartaal(new Date("2026-01-05T10:00:00+01:00"))).toEqual({ jaar: 2025, kwartaal: 4 });
    expect(standaardKwartaal(new Date("2026-07-01T00:30:00+02:00"))).toEqual({ jaar: 2026, kwartaal: 2 });
    // 30 juni 23:30 UTC is in Amsterdam al 1 juli
    expect(standaardKwartaal(new Date("2026-06-30T23:30:00Z"))).toEqual({ jaar: 2026, kwartaal: 2 });
  });
  it("biedt drie jaren aan", () => {
    expect(jaarKeuzes(new Date("2026-04-10T10:00:00+02:00"))).toEqual([2026, 2025, 2024]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

function regel(extra: Partial<ControleRegel> = {}): ControleRegel {
  return {
    boekingId: "b1",
    rekeningSoort: "OMZET",
    debetCents: 0,
    creditCents: 0,
    isBtwRegel: false,
    btwBasisCents: null,
    btwCode: null,
    tariefBasispunten: null,
    richting: null,
    ...extra,
  };
}

/** Een nette verkoop 21%: omzetregel en btw-regel. */
const netteVerkoop = (boekingId = "b1"): ControleRegel[] => [
  regel({ boekingId, creditCents: 10000, btwBasisCents: 10000, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
  regel({ boekingId, rekeningSoort: "PASSIVA", creditCents: 2100, isBtwRegel: true, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
];

function invoer(extra: Partial<ControleInvoer> = {}): ControleInvoer {
  const regels = extra.regels ?? netteVerkoop();
  const berekening = berekenBtw(verkoopRegels("1a", 10000, 2100));
  return {
    van: "2026-01-01",
    tot: "2026-03-31",
    vandaag: "2026-04-10",
    btwPlichtig: true,
    berekening,
    regels,
    rekeningSaldoCents: 2100,
    bonnenZonderBoeking: [],
    bonBoekingen: [],
    ...extra,
  };
}

const codes = (m: ReturnType<typeof controleerBtw>) => m.map((x) => x.code);

describe("controleerBtw", () => {
  it("een schoon kwartaal geeft geen meldingen", () => {
    expect(controleerBtw(invoer())).toEqual([]);
  });

  it("(a) afwijking tussen rubrieken en btw-rekeningen blokkeert, met het verschil in gewoon Nederlands", () => {
    const m = controleerBtw(invoer({ rekeningSaldoCents: 1500 }));
    const a = m.find((x) => x.code === "BTW_WIJKT_AF_VAN_REKENINGEN");
    expect(a?.ernst).toBe("blokkeert");
    expect(a?.tekst).toContain("Het verschil is");
    expect(a?.tekst).toContain("6,00");
    expect(heeftBlokkade(m)).toBe(true);
  });

  it("(a) geen vergelijking als het saldo van de rekeningen niet is op te halen", () => {
    expect(codes(controleerBtw(invoer({ rekeningSaldoCents: null })))).not.toContain("BTW_WIJKT_AF_VAN_REKENINGEN");
  });

  it("een onbekende rubriek blokkeert", () => {
    const berekening = berekenBtw([{ debetCents: 0, creditCents: 100, isBtwRegel: true, btwBasisCents: null, ...verkoop(null, "9z") }]);
    expect(codes(controleerBtw(invoer({ berekening, rekeningSaldoCents: 0 })))).toContain("ONBEKENDE_RUBRIEK");
  });

  it("(b) omzet of kosten zonder btw-code is een let-op met de boeking-id's, zonder btw-regels en bankrekeningen", () => {
    const m = controleerBtw(
      invoer({
        regels: [
          ...netteVerkoop(),
          regel({ boekingId: "b2", rekeningSoort: "KOSTEN", debetCents: 500 }),
          regel({ boekingId: "b2", rekeningSoort: "ACTIVA", creditCents: 500 }),
          regel({ boekingId: "b3", rekeningSoort: "KOSTEN", debetCents: 100 }),
        ],
      }),
    );
    const x = m.find((y) => y.code === "GEEN_BTW_CODE");
    expect(x?.ernst).toBe("let-op");
    expect(x?.verwijzing).toEqual({ boekingen: ["b2", "b3"], bonnen: [], aantal: 2 });
    expect(x?.tekst).toMatch(/^2 boekingen hebben geen btw-code/);
  });

  it("(c) bonnen zonder boeking in het kwartaal tellen mee, die van een ander kwartaal niet", () => {
    const m = controleerBtw(
      invoer({
        bonnenZonderBoeking: [
          { id: "bon1", status: "GELEZEN", geuploadOp: "2026-04-02", bonDatum: "2026-02-10" },
          { id: "bon2", status: "NIEUW", geuploadOp: "2026-03-20" },
          { id: "bon3", status: "GELEZEN", geuploadOp: "2026-04-02", bonDatum: "2026-04-01" },
        ],
      }),
    );
    const x = m.find((y) => y.code === "BON_ZONDER_BOEKING");
    expect(x?.verwijzing.bonnen).toEqual(["bon1", "bon2"]);
    expect(x?.ernst).toBe("let-op");
  });

  it("(d) boeking in een ander kwartaal dan de bon wordt gemeld, in dezelfde periode niet", () => {
    const m = controleerBtw(
      invoer({
        bonBoekingen: [
          { boekingId: "b5", bonId: "bon5", boekDatum: "2026-04-03", bonDatum: "2026-03-28" },
          { boekingId: "b6", bonId: "bon6", boekDatum: "2026-03-05", bonDatum: "2026-03-01" },
          { boekingId: "b7", bonId: "bon7", boekDatum: "2026-05-05", bonDatum: "2026-05-01" },
          { boekingId: "b8", bonId: "bon8", boekDatum: "2026-02-05", bonDatum: "2025-12-30" },
        ],
      }),
    );
    const x = m.find((y) => y.code === "BOEKING_IN_ANDER_KWARTAAL");
    expect(x?.verwijzing.boekingen).toEqual(["b5", "b8"]);
    expect(x?.verwijzing.bonnen).toEqual(["bon5", "bon8"]);
  });

  it("(e) een negatieve btw bij een positief bedrag blokkeert", () => {
    const m = controleerBtw(
      invoer({
        regels: [
          regel({ boekingId: "b9", creditCents: 10000, btwBasisCents: 10000, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
          regel({ boekingId: "b9", rekeningSoort: "PASSIVA", debetCents: 2100, isBtwRegel: true, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
        ],
      }),
    );
    expect(m.find((x) => x.code === "BTW_PERCENTAGE_ONMOGELIJK")?.ernst).toBe("blokkeert");
  });

  it("(e) een onmogelijk tarief (30%) blokkeert, een afwijkend bedrag is een let-op", () => {
    const m30 = controleerBtw(invoer({ regels: [regel({ boekingId: "b9", creditCents: 100, btwBasisCents: 100, btwCode: "X", tariefBasispunten: 3000, richting: "VERKOOP" })] }));
    expect(codes(m30)).toContain("BTW_PERCENTAGE_ONMOGELIJK");

    const afwijkend = controleerBtw(
      invoer({
        regels: [
          regel({ boekingId: "b9", creditCents: 10000, btwBasisCents: 10000, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
          regel({ boekingId: "b9", rekeningSoort: "PASSIVA", creditCents: 900, isBtwRegel: true, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
        ],
      }),
    );
    expect(afwijkend.find((x) => x.code === "BTW_PERCENTAGE_WIJKT_AF")?.ernst).toBe("let-op");
  });

  it("(e) een tegenboeking (alles omgekeerd) is geen fout, en een afrondingsverschil van een cent ook niet", () => {
    const terug = [
      regel({ boekingId: "b9", debetCents: 10000, btwBasisCents: 10000, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
      regel({ boekingId: "b9", rekeningSoort: "PASSIVA", debetCents: 2100, isBtwRegel: true, btwCode: "NL21-V", tariefBasispunten: 2100, richting: "VERKOOP" }),
    ];
    expect(codes(controleerBtw(invoer({ regels: terug })))).not.toContain("BTW_PERCENTAGE_ONMOGELIJK");
    const cent = [
      regel({ boekingId: "b9", creditCents: 4505, btwBasisCents: 4505, btwCode: "NL09-V", tariefBasispunten: 900, richting: "VERKOOP" }),
      regel({ boekingId: "b9", rekeningSoort: "PASSIVA", creditCents: 406, isBtwRegel: true, btwCode: "NL09-V", tariefBasispunten: 900, richting: "VERKOOP" }),
    ];
    expect(codes(controleerBtw(invoer({ regels: cent })))).not.toContain("BTW_PERCENTAGE_WIJKT_AF");
  });

  it("(f) een bon met even kijken blokkeert, ongeacht de datum, en komt niet ook onder (c)", () => {
    const m = controleerBtw(invoer({ bonnenZonderBoeking: [{ id: "bon9", status: "EVEN_KIJKEN", geuploadOp: "2025-11-02", bonDatum: "2025-11-01" }] }));
    expect(m.find((x) => x.code === "EVEN_KIJKEN_OPEN")?.ernst).toBe("blokkeert");
    expect(codes(m)).not.toContain("BON_ZONDER_BOEKING");
  });

  it("info bij een niet btw-plichtige administratie, een lopend kwartaal en een lege periode", () => {
    const m = controleerBtw(invoer({ btwPlichtig: false, vandaag: "2026-03-15", regels: [], rekeningSaldoCents: 2100 }));
    expect(codes(m)).toEqual(expect.arrayContaining(["NIET_BTW_PLICHTIG", "KWARTAAL_LOOPT_NOG", "LEGE_PERIODE"]));
    expect(m.filter((x) => x.ernst === "info").length).toBeGreaterThanOrEqual(3);
  });

  it("meldingen staan op ernst gesorteerd, verwijzingen zijn beperkt tot 25 en bevatten alleen id's", () => {
    const veel = Array.from({ length: 40 }, (_, i) => regel({ boekingId: `k${i}`, rekeningSoort: "KOSTEN", debetCents: 10 }));
    const m = controleerBtw(invoer({ regels: [...netteVerkoop(), ...veel], rekeningSaldoCents: 0 }));
    expect(m[0]?.ernst).toBe("blokkeert");
    const x = m.find((y) => y.code === "GEEN_BTW_CODE");
    expect(x?.verwijzing.boekingen).toHaveLength(25);
    expect(x?.verwijzing.aantal).toBe(40);
    expect(JSON.stringify(m)).not.toMatch(/@/);
  });
});
