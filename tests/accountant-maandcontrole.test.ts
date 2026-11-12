import { describe, expect, it } from "vitest";
import type { BonZonderBoeking, BoekingRij } from "@/lib/boekhouding/lezen";
import type { OpenPost, ProefbalansRij } from "@/lib/boekhouding/lezen-kern";
import {
  btwZonderCode,
  dagenTussen,
  datumInToekomst,
  debiteurenLangOpen,
  kostenZonderBon,
  maandcontrole,
  mogelijkDubbel,
  rekeningInfo,
  uitschieters,
  vorigeMaand,
} from "@/lib/accountant/maandcontrole-kern";

// Rekeningen zoals in b3's basisschema (lib/boekhouding/rgs-schema.ts).
const PROEFBALANS: ProefbalansRij[] = [
  { rekeningNummer: "1100", naam: "Bank", kant: "BALANS", debetCents: 0, creditCents: 0 },
  { rekeningNummer: "1200", naam: "Debiteuren", kant: "BALANS", debetCents: 0, creditCents: 0 },
  { rekeningNummer: "1300", naam: "Te vorderen btw (voorbelasting)", kant: "BALANS", debetCents: 0, creditCents: 0 },
  { rekeningNummer: "2200", naam: "Crediteuren", kant: "BALANS", debetCents: 0, creditCents: 0 },
  { rekeningNummer: "2300", naam: "Te betalen btw", kant: "BALANS", debetCents: 0, creditCents: 0 },
  { rekeningNummer: "4000", naam: "Hosting en infrastructuur", kant: "WV", debetCents: 0, creditCents: 0 },
  { rekeningNummer: "8000", naam: "Omzet platformfee", kant: "WV", debetCents: 0, creditCents: 0 },
];
const INFO = rekeningInfo(PROEFBALANS);

let n = 0;
function boeking(p: Partial<BoekingRij> & { regels: BoekingRij["regels"] }): BoekingRij {
  n += 1;
  return { id: `b${n}`, boekstuk: `MEM-${n}`, datum: "2026-10-10", dagboek: "INKOOP", bron: "BON", bronId: `bron-${n}`, omschrijving: "Bon 1", heeftBijlage: true, ...p };
}
/** Een kostenpost: kosten + voorbelasting tegen crediteuren. */
const kosten = (cents: number, p: Partial<BoekingRij> = {}) =>
  boeking({
    regels: [
      { rekeningNummer: "4000", debetCents: cents, creditCents: 0, btwCode: "INK21" },
      { rekeningNummer: "1300", debetCents: Math.round(cents * 0.21), creditCents: 0, btwCode: "INK21" },
      { rekeningNummer: "2200", debetCents: 0, creditCents: cents + Math.round(cents * 0.21) },
    ],
    ...p,
  });

describe("rekeninginfo", () => {
  it("herkent winst-en-verlies en btw-rekeningen op naam", () => {
    expect(INFO.get("4000")).toEqual({ kant: "WV", btw: false });
    expect(INFO.get("1300")?.btw).toBe(true);
    expect(INFO.get("2300")?.btw).toBe(true);
    expect(INFO.get("1100")?.btw).toBe(false);
  });
});

describe("kosten zonder bonnetje", () => {
  it("meldt kosten zonder bijlage, maar niet de verkoop of een tegenboeking", () => {
    const b = kostenZonderBon(
      [
        kosten(10_000, { heeftBijlage: false, dagboek: "BANK", bron: "BANK", boekstuk: "BNK-1" }),
        kosten(5_000), // met bon
        kosten(7_000, { heeftBijlage: false, bron: "TEGENBOEKING" }),
        boeking({ dagboek: "VERKOOP", heeftBijlage: false, regels: [{ rekeningNummer: "1200", debetCents: 12_100, creditCents: 0 }, { rekeningNummer: "8000", debetCents: 0, creditCents: 12_100 }] }),
      ],
      INFO,
    );
    expect(b?.boekstukken).toEqual(["BNK-1"]);
    expect(b?.ernst).toBe("probleem");
    expect(b?.bedragCents).toBe(12_100);
  });
});

describe("mogelijk dubbel", () => {
  it("vindt twee gelijke bedragen binnen drie dagen, niet verder uit elkaar", () => {
    const uit = mogelijkDubbel([
      kosten(9_900, { datum: "2026-10-01", boekstuk: "INK-1" }),
      kosten(9_900, { datum: "2026-10-03", boekstuk: "INK-2" }),
      kosten(9_900, { datum: "2026-10-20", boekstuk: "INK-3" }),
    ]);
    expect(uit).toHaveLength(1);
    expect(uit[0]?.boekstukken).toEqual(["INK-1", "INK-2"]);
  });
});

describe("btw zonder code", () => {
  it("meldt een btw-regel zonder code, maar niet de btw-betaling via de bank", () => {
    const zonderCode = boeking({
      dagboek: "MEMORIAAL",
      bron: "MEMORIAAL",
      boekstuk: "MEM-X",
      regels: [{ rekeningNummer: "2300", debetCents: 0, creditCents: 2_100 }, { rekeningNummer: "4000", debetCents: 2_100, creditCents: 0 }],
    });
    const afdracht = boeking({ dagboek: "BANK", bron: "BANK", regels: [{ rekeningNummer: "2300", debetCents: 50_000, creditCents: 0 }, { rekeningNummer: "1100", debetCents: 0, creditCents: 50_000 }] });
    const b = btwZonderCode([zonderCode, afdracht, kosten(1_000)], INFO);
    expect(b?.boekstukken).toEqual(["MEM-X"]);
  });
});

describe("datum en debiteuren", () => {
  it("meldt een boeking na vandaag", () => {
    expect(datumInToekomst([kosten(100, { datum: "2027-10-10", boekstuk: "INK-9" })], "2026-11-12")?.boekstukken).toEqual(["INK-9"]);
    expect(datumInToekomst([kosten(100)], "2026-11-12")).toBeNull();
  });
  it("meldt debiteuren die langer dan 30 dagen openstaan, en na 60 dagen als probleem", () => {
    const posten: OpenPost[] = [
      { postSleutel: "factuur:a", rekeningNummer: "1200", saldoCents: 12_100, oudsteDatum: "2026-10-20", soort: "DEBITEUR" },
      { postSleutel: "factuur:b", rekeningNummer: "1200", saldoCents: 30_000, oudsteDatum: "2026-09-01", soort: "DEBITEUR" },
      { postSleutel: "inkoop:c", rekeningNummer: "2200", saldoCents: 5_000, oudsteDatum: "2026-01-01", soort: "CREDITEUR" },
    ];
    const b = debiteurenLangOpen(posten, "2026-11-12");
    expect(b?.bedragCents).toBe(30_000);
    expect(dagenTussen("2026-09-01", "2026-11-12")).toBe(72);
    expect(b?.ernst).toBe("probleem"); // 72 dagen: meer dan twee keer 30
    const recent = debiteurenLangOpen([{ postSleutel: "factuur:d", rekeningNummer: "1200", saldoCents: 1_000, oudsteDatum: "2026-10-05", soort: "DEBITEUR" }], "2026-11-12");
    expect(recent?.ernst).toBe("nakijken"); // 38 dagen
  });
});

describe("uitschieters", () => {
  it("meldt een post ver boven de gewone bedragen op dezelfde rekening", () => {
    const gewoon = [10_000, 11_000, 9_000, 10_500, 9_500].map((c) => kosten(c));
    const groot = kosten(200_000, { boekstuk: "INK-GROOT" });
    const uit = uitschieters([...gewoon, groot], INFO);
    expect(uit.map((b) => b.boekstukken[0])).toEqual(["INK-GROOT"]);
  });
  it("zegt niets met te weinig posten", () => {
    expect(uitschieters([kosten(10_000), kosten(500_000)], INFO)).toEqual([]);
  });
});

describe("maandcontrole", () => {
  it("zet problemen voor nakijken en info, en meldt een afgekapte lijst", () => {
    const bonnen: BonZonderBoeking[] = [{ id: "bon1", status: "NIEUW", geuploadOp: "2026-11-10" }];
    const uit = maandcontrole({
      vandaag: "2026-11-12",
      boekingen: [kosten(10_000, { heeftBijlage: false, dagboek: "BANK", bron: "BANK" }), kosten(100, { datum: "2026-12-01" })],
      afgekapt: true,
      proefbalans: PROEFBALANS,
      openPosten: [],
      bonnen,
    });
    expect(uit.map((b) => b.soort)).toEqual(["kosten-zonder-bon", "datum-in-toekomst", "bon-niet-geboekt", "te-veel-boekingen"]);
  });
  it("is leeg als alles klopt", () => {
    expect(maandcontrole({ vandaag: "2026-11-12", boekingen: [kosten(1_000)], afgekapt: false, proefbalans: PROEFBALANS, openPosten: [], bonnen: [] })).toEqual([]);
  });
});

describe("vorige maand", () => {
  it("geeft de vorige volle maand, ook over de jaargrens", () => {
    expect(vorigeMaand("2026-11-12")).toEqual({ van: "2026-10-01", tot: "2026-10-31" });
    expect(vorigeMaand("2027-01-05")).toEqual({ van: "2026-12-01", tot: "2026-12-31" });
    expect(vorigeMaand("2028-03-01")).toEqual({ van: "2028-02-01", tot: "2028-02-29" });
  });
});
