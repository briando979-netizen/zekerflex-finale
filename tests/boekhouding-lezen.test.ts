import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deadlineLijst } from "@/lib/boekhouding/deadlines";
import { btwOverzichtUit, kwartaalGrenzen, openPostenUit, proefbalansRijen } from "@/lib/boekhouding/lezen-kern";

describe("proefbalansRijen", () => {
  const rekeningen = [
    { id: "r1", nummer: "1200", rgsCode: null, naam: "Debiteuren", soort: "ACTIVA" },
    { id: "r2", nummer: "8000", rgsCode: "WOmz", naam: "Omzet platformfee", soort: "OMZET" },
    { id: "r3", nummer: "1100", rgsCode: null, naam: "Bank", soort: "ACTIVA" },
  ];
  it("sorteert op nummer, laat lege rekeningen weg en zet de kant", () => {
    const rijen = proefbalansRijen(rekeningen, [
      { rekeningId: "r2", debetCents: 0, creditCents: 10000 },
      { rekeningId: "r1", debetCents: 12100, creditCents: 0 },
      { rekeningId: "r3", debetCents: 0, creditCents: 0 },
      { rekeningId: "onbekend", debetCents: 5, creditCents: 0 },
    ]);
    expect(rijen).toEqual([
      { rekeningNummer: "1200", naam: "Debiteuren", kant: "BALANS", debetCents: 12100, creditCents: 0 },
      { rekeningNummer: "8000", rgsCode: "WOmz", naam: "Omzet platformfee", kant: "WV", debetCents: 0, creditCents: 10000 },
    ]);
  });
});

describe("openPostenUit", () => {
  const regel = (extra: object) => ({
    postSleutel: "factuur:a",
    rekeningNummer: "1200",
    rekeningSoort: "ACTIVA",
    debetCents: 0,
    creditCents: 0,
    datum: "2026-04-10",
    ...extra,
  });
  it("een factuur zonder betaling is open, met betaling gesloten", () => {
    expect(openPostenUit([regel({ debetCents: 12100 })], "2026-04-30")).toEqual([
      { postSleutel: "factuur:a", rekeningNummer: "1200", saldoCents: 12100, oudsteDatum: "2026-04-10", soort: "DEBITEUR" },
    ]);
    expect(openPostenUit([regel({ debetCents: 12100 }), regel({ creditCents: 12100, datum: "2026-04-20" })], "2026-04-30")).toEqual([]);
  });
  it("de peildatum telt: een betaling daarna is nog niet verwerkt", () => {
    const r = [regel({ debetCents: 12100 }), regel({ creditCents: 12100, datum: "2026-04-20" })];
    expect(openPostenUit(r, "2026-04-15")).toHaveLength(1);
  });
  it("een deelbetaling laat het restant open; een crediteur heeft een creditsaldo", () => {
    const r = [regel({ debetCents: 12100 }), regel({ creditCents: 5000, datum: "2026-04-20" })];
    expect(openPostenUit(r, "2026-04-30")[0]?.saldoCents).toBe(7100);
    const c = openPostenUit([regel({ postSleutel: "bon:1", rekeningNummer: "2200", rekeningSoort: "PASSIVA", creditCents: 300 })], "2026-04-30");
    expect(c[0]).toMatchObject({ soort: "CREDITEUR", saldoCents: 300 });
  });
});

describe("btwOverzichtUit", () => {
  const verkoopOmzet = { debetCents: 0, creditCents: 10000, isBtwRegel: false, btwBasisCents: 10000, richting: "VERKOOP" as const, grondslagRubriek: "1a", btwRubriek: "1a" };
  const verkoopBtw = { debetCents: 0, creditCents: 2100, isBtwRegel: true, btwBasisCents: null, richting: "VERKOOP" as const, grondslagRubriek: "1a", btwRubriek: "1a" };
  it("grondslag en btw per rubriek, saldo te betalen, nooit bevestigd", () => {
    const o = btwOverzichtUit([verkoopOmzet, verkoopBtw]);
    expect(o.rubrieken).toEqual([{ rubriek: "1a", grondslagCents: 10000, btwCents: 2100 }]);
    expect(o.geboektSaldoCents).toBe(2100);
    expect(o.rubriekBevestigd).toBe(false);
    expect(o.opmerking).toMatch(/accountant/);
  });
  it("een tegenboeking haalt grondslag en btw weer weg", () => {
    const tegen = [
      { ...verkoopOmzet, debetCents: 10000, creditCents: 0 },
      { ...verkoopBtw, debetCents: 2100, creditCents: 0 },
    ];
    const o = btwOverzichtUit([verkoopOmzet, verkoopBtw, ...tegen]);
    expect(o.rubrieken).toEqual([{ rubriek: "1a", grondslagCents: 0, btwCents: 0 }]);
    expect(o.geboektSaldoCents).toBe(0);
  });
  it("voorbelasting verlaagt het saldo en staat als positief bedrag in 5b", () => {
    const inkoop = { debetCents: 420, creditCents: 0, isBtwRegel: true, btwBasisCents: null, richting: "INKOOP" as const, grondslagRubriek: null, btwRubriek: "5b" };
    const o = btwOverzichtUit([verkoopOmzet, verkoopBtw, inkoop]);
    expect(o.rubrieken.find((r) => r.rubriek === "5b")).toEqual({ rubriek: "5b", grondslagCents: 0, btwCents: 420 });
    expect(o.geboektSaldoCents).toBe(1680);
  });
});

describe("kwartaalGrenzen", () => {
  it("geeft de eerste en laatste dag", () => {
    expect(kwartaalGrenzen(2026, 1)).toEqual({ van: "2026-01-01", tot: "2026-03-31" });
    expect(kwartaalGrenzen(2026, 2)).toEqual({ van: "2026-04-01", tot: "2026-06-30" });
    expect(kwartaalGrenzen(2028, 4)).toEqual({ van: "2028-10-01", tot: "2028-12-31" });
  });
  it("weigert een ongeldig kwartaal, in het Nederlands", () => {
    expect(() => kwartaalGrenzen(2026, 5)).toThrow(/kwartaal/);
  });
});

describe("deadlineLijst", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T10:00:00+01:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("bevat de 83(b) op 9 december 2026 en bij elk de bevestigingsregel", () => {
    const lijst = deadlineLijst();
    const irs = lijst.find((d) => d.sleutel === "irs-83b-2026");
    expect(irs?.datum.toISOString()).toBe("2026-12-09T22:59:59.000Z");
    expect(new Set(lijst.map((d) => d.sleutel)).size).toBe(lijst.length);
    for (const d of lijst) expect(d.bevestigDoor).toMatch(/accountant of US tax preparer bevestigt de datum/);
  });

  it("5472 op 15 april met boetewaarschuwing, Delaware op 1 maart", () => {
    const lijst = deadlineLijst();
    const f5472 = lijst.find((d) => d.sleutel === "us-1120-5472-2027");
    expect(f5472?.datum.toISOString()).toBe("2027-04-15T21:59:59.000Z");
    expect(f5472?.waarschuwing).toMatch(/5472.*boete/);
    expect(lijst.find((d) => d.sleutel === "delaware-franchise-tax-2027")?.datum.toISOString()).toBe("2027-03-01T22:59:59.000Z");
  });

  it("btw en ICP per kwartaal: K4 2026 valt op 31 januari 2027, K3 op 31 oktober 2026 is voorbij", () => {
    const sleutels = deadlineLijst().map((d) => d.sleutel);
    expect(sleutels).toContain("btw-2026-k4");
    expect(sleutels).toContain("icp-2026-k4");
    expect(sleutels).not.toContain("btw-2026-k3");
    const k4 = deadlineLijst().find((d) => d.sleutel === "btw-2026-k4");
    expect(k4?.datum.toISOString()).toBe("2027-01-31T22:59:59.000Z");
  });

  it("is gesorteerd op datum en toont geen verstreken deadlines", () => {
    const lijst = deadlineLijst();
    const tijden = lijst.map((d) => d.datum.getTime());
    expect(tijden).toEqual([...tijden].sort((a, b) => a - b));
    expect(tijden.every((t) => t >= Date.now())).toBe(true);
  });
});
