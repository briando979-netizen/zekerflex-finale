import { describe, expect, it } from "vitest";
import type { BestelRegel } from "@/lib/horeca/bestellen";
import { afhaalNummers, allesTegelijk, bonnenVoor, liveCijfers, nogTeKomen, opAandacht, recentKlaar, zaalLive, type LiveBestelling, type LiveReservering, type LiveTafel } from "@/lib/horeca/zaal";

// 4 november 2026, 19:00 in Nederland = 18:00 UTC
const NU_MS = Date.parse("2026-11-04T18:00:00.000Z");
const NU_MIN = 19 * 60;
const minGeleden = (m: number) => new Date(NU_MS - m * 60_000).toISOString();

const tafel = (id: string, naam = id): LiveTafel => ({ id, naam, plaatsen: 4, zone: "", actief: true });
const r = (naam: string, station: "keuken" | "bar", extra: Partial<BestelRegel> = {}): BestelRegel => ({ itemId: naam, naam, prijsCent: 1000, aantal: 1, opmerking: "", station, ...extra });
let n = 0;
const best = (tafelId: string | null, regels: BestelRegel[], extra: Partial<LiveBestelling> = {}): LiveBestelling => ({
  id: `b${++n}`,
  nummer: n,
  tafelId,
  status: "NIEUW",
  regels,
  totaalCent: regels.reduce((s, x) => s + x.prijsCent * x.aantal, 0),
  betaald: false,
  createdAt: minGeleden(5),
  ...extra,
});
const res = (id: string, tafelId: string | null, tijd: string, status: LiveReservering["status"] = "BEVESTIGD", personen = 2): LiveReservering => ({ id, tafelId, tijd, personen, naam: `Gast ${id}`, status });

const zaal = (i: Partial<Parameters<typeof zaalLive>[0]>) =>
  zaalLive({ tafels: [tafel("t1")], bestellingen: [], reserveringen: [], oproepen: [], nuMs: NU_MS, nuMin: NU_MIN, verblijfMin: 120, ...i });

describe("horeca-zaal: tafelstatus", () => {
  it("een lege tafel is vrij", () => {
    expect(zaal({})[0]?.staat).toBe("vrij");
  });

  it("een reservering binnen anderhalf uur maakt de tafel gereserveerd", () => {
    expect(zaal({ reserveringen: [res("r1", "t1", "20:00")] })[0]).toMatchObject({ staat: "gereserveerd", reservering: { tijd: "20:00" } });
    expect(zaal({ reserveringen: [res("r1", "t1", "21:00")] })[0]?.staat).toBe("vrij");
  });

  it("aangekomen gasten zonder bestelling: bezet", () => {
    expect(zaal({ reserveringen: [res("r1", "t1", "18:30", "AANGEKOMEN")] })[0]?.staat).toBe("bezet");
  });

  it("besteld en in de keuken: bezet; te lang: wacht", () => {
    expect(zaal({ bestellingen: [best("t1", [r("Burger", "keuken")])] })[0]).toMatchObject({ staat: "bezet", wachtMin: 5, openBestellingen: 1 });
    expect(zaal({ bestellingen: [best("t1", [r("Burger", "keuken")], { createdAt: minGeleden(20) })] })[0]?.staat).toBe("wacht");
  });

  it("iets klaar om te serveren gaat voor alles", () => {
    const b = best("t1", [r("Burger", "keuken", { fase: "klaar" }), r("Cola", "bar", { aantal: 2, fase: "klaar" })], { status: "KLAAR", createdAt: minGeleden(30) });
    expect(zaal({ bestellingen: [b] })[0]).toMatchObject({ staat: "serveren", serveren: 3 });
  });

  it("alles geserveerd maar nog niet betaald: rekening open; betaald: vrij", () => {
    const b = best("t1", [r("Burger", "keuken", { fase: "geserveerd" })], { status: "GESERVEERD" });
    expect(zaal({ bestellingen: [b] })[0]).toMatchObject({ staat: "rekening", openCent: 1000 });
    expect(zaal({ bestellingen: [{ ...b, betaald: true }] })[0]?.staat).toBe("vrij");
  });

  it("geannuleerd telt nergens mee", () => {
    expect(zaal({ bestellingen: [best("t1", [r("Burger", "keuken")], { status: "GEANNULEERD" })] })[0]).toMatchObject({ staat: "vrij", openCent: 0 });
  });

  it("de rekening vragen weegt zwaarder dan de ober roepen", () => {
    const t = zaal({
      oproepen: [
        { tafelId: "t1", soort: "ober", op: minGeleden(1) },
        { tafelId: "t1", soort: "rekening", op: minGeleden(1) },
      ],
    })[0];
    expect(t?.oproep).toBe("rekening");
  });

  it("inactieve tafels doen niet mee", () => {
    expect(zaal({ tafels: [{ ...tafel("t1"), actief: false }] })).toHaveLength(0);
  });

  it("op aandacht: oproep eerst, dan serveren, dan op nummer", () => {
    const tafels = [tafel("t10", "Tafel 10"), tafel("t2", "Tafel 2"), tafel("t3", "Tafel 3"), tafel("t4", "Tafel 4")];
    const lijst = opAandacht(
      zaal({
        tafels,
        bestellingen: [best("t3", [r("Burger", "keuken", { fase: "klaar" })])],
        oproepen: [{ tafelId: "t4", soort: "ober", op: minGeleden(1) }],
      }),
    ).map((t) => t.naam);
    expect(lijst).toEqual(["Tafel 4", "Tafel 3", "Tafel 2", "Tafel 10"]);
  });
});

describe("horeca-zaal: cijfers van vandaag", () => {
  it("omzet zonder geannuleerd en zonder gisteren, gasten en bereidingstijd", () => {
    const bestellingen = [
      best("t1", [r("Burger", "keuken", { fase: "klaar", klaarOp: minGeleden(10) })], { status: "KLAAR", createdAt: minGeleden(22) }),
      best("t1", [r("Cola", "bar")], { status: "GEANNULEERD" }),
      best(null, [r("Taart", "keuken")], { createdAt: "2026-11-03T20:00:00.000Z" }),
    ];
    const reserveringen = [res("a", "t1", "18:00", "AANGEKOMEN", 4), res("b", null, "20:00", "BEVESTIGD", 2), res("c", null, "17:00", "NIET_GEKOMEN", 3), res("d", null, "21:00", "GEANNULEERD", 6)];
    const z = zaal({ bestellingen, reserveringen });
    const c = liveCijfers({ bestellingen, reserveringen, zaal: z, vandaag: "2026-11-04", nuMs: NU_MS });
    expect(c).toMatchObject({ omzetCent: 1000, bestellingen: 1, klaar: 1, bereidingMin: 12, gastenVerwacht: 6, gastenBinnen: 4, gastenNogTeKomen: 2, noShows: 3, reserveringen: 2, tafelsBezet: 1, tafelsActief: 1 });
    // de taart van gisteren wacht nog: die telt wel als wachtend
    expect(c.inBereiding).toBe(1);
  });

  it("nog te komen: alleen bevestigd, niet langer dan een half uur te laat, op tijd", () => {
    const lijst = nogTeKomen([res("a", null, "20:30"), res("b", null, "18:20"), res("c", null, "18:40"), res("d", null, "19:30", "AANGEKOMEN")], NU_MIN);
    expect(lijst.map((x) => x.id)).toEqual(["c", "a"]);
  });
});

describe("horeca-zaal: schermen", () => {
  it("alles-tegelijk telt per station wat nog gemaakt moet worden", () => {
    const bestellingen = [
      best("t1", [r("Friet", "keuken", { aantal: 2 }), r("Cola", "bar")]),
      best("t2", [r("Friet", "keuken"), r("Burger", "keuken", { fase: "klaar" })]),
      best("t3", [r("Friet", "keuken", { aantal: 5 })], { status: "GEANNULEERD" }),
    ];
    expect(allesTegelijk(bestellingen, "keuken")).toEqual([{ naam: "Friet", aantal: 3 }]);
    expect(allesTegelijk(bestellingen, "bar")).toEqual([{ naam: "Cola", aantal: 1 }]);
  });

  it("bonnen voor de bar: alleen wat de bar nog moet doen, oudste eerst", () => {
    const oud = best("t1", [r("Bier", "bar")], { createdAt: minGeleden(9) });
    const klaar = best("t2", [r("Wijn", "bar", { fase: "klaar", klaarOp: minGeleden(1) })]);
    const keuken = best("t3", [r("Burger", "keuken")]);
    const nieuw = best("t4", [r("Cola", "bar")], { createdAt: minGeleden(1) });
    expect(bonnenVoor([nieuw, klaar, keuken, oud], "bar").map((x) => x.b.id)).toEqual([oud.id, nieuw.id]);
    expect(recentKlaar([nieuw, klaar, keuken, oud], "bar").map((b) => b.id)).toEqual([klaar.id]);
  });

  it("afhaalscherm: alleen nummers zonder tafel, in bereiding en klaar", () => {
    const lijst = [
      best(null, [r("Tosti", "keuken")], { nummer: 12 }),
      best(null, [r("Soep", "keuken", { fase: "klaar" })], { nummer: 9, status: "KLAAR" }),
      best("t1", [r("Burger", "keuken")], { nummer: 4 }),
      best(null, [r("Thee", "bar")], { nummer: 7, status: "GESERVEERD" }),
    ];
    expect(afhaalNummers(lijst, NU_MS)).toEqual({ bereiding: [12], klaar: [9] });
  });
});
