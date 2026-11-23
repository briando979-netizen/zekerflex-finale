import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De cijfers op de kluspagina van een bedrijf en in de profielkaart (23 nov 2026): alleen wat wij echt meten.
// lib/employer/prestaties-kern.ts is puur; de regel voor "zelf afgezegd of niet opgekomen" komt uit lib/profile/card.ts.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/profile/store", () => ({ getUserProfileExtra: async () => ({}), getOrgProfileExtra: async () => ({}) }));
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: async () => ({ average: 0, count: 0, distribution: {}, recent: [] }) }));

import {
  MIN_VOOR_PERCENTAGE,
  actieveRegios,
  alGematchtOpDag,
  ervaringIn,
  gewerkteUrenBij,
  telPrestaties,
  type PrestatieRij,
} from "@/lib/employer/prestaties-kern";
import { groepeerReviews, gewerktBij } from "@/lib/employer/kaart-kern";

const NU = new Date("2026-11-23T12:00:00+01:00");
const dagenTerug = (n: number, uur = 9) => new Date(NU.getTime() - n * 86_400_000 + (uur - 12) * 3_600_000);

function rij(p: {
  dagen: number;
  soort?: "gewerkt" | "afgezegd" | "nietOpgekomen" | "vervangen" | "bedrijf" | "geenUren";
  tenantId?: string;
  city?: string;
  title?: string;
  skill?: string | null;
  minuten?: number;
  lat?: number;
  lng?: number;
  shiftId?: string;
}): PrestatieRij {
  const soort = p.soort ?? "gewerkt";
  const start = dagenTerug(p.dagen, 9);
  const eind = dagenTerug(p.dagen, 17);
  const reden: Record<string, string | null> = {
    afgezegd: "Afgezegd door flexwerker (buiten de opzegtermijn): ziek",
    nietOpgekomen: "Niet opgekomen",
    vervangen: "Vervangen via ZekerFlex (vrije vervanging)",
    bedrijf: "Geannuleerd door opdrachtgever: regen",
  };
  const geannuleerd = Object.hasOwn(reden, soort);
  return {
    shiftId: p.shiftId ?? `s-${p.dagen}-${soort}`,
    tenantId: p.tenantId ?? "t1",
    cancelledAt: geannuleerd ? start : null,
    cancelReason: geannuleerd ? (reden[soort] ?? null) : null,
    timesheet: soort === "gewerkt" ? { status: "APPROVED", actualStart: start, billableMinutes: p.minuten ?? 0 } : soort === "geenUren" ? { status: "DRAFT", actualStart: null, billableMinutes: 0 } : null,
    shift: {
      title: p.title ?? "Orderpicker",
      skill: p.skill ?? null,
      startsAt: start,
      endsAt: eind,
      breakMinutes: 30,
      city: p.city ?? "Utrecht",
      lat: p.lat ?? 52.0907,
      lng: p.lng ?? 5.1214,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

describe("telPrestaties: de drie cijfers en de twee percentages over 6 maanden", () => {
  it("telt zelf gewerkt, vervanging geregeld en niet voltooid; een annulering door het bedrijf telt niet mee", () => {
    const p = telPrestaties(
      [
        rij({ dagen: 10 }),
        rij({ dagen: 20 }),
        rij({ dagen: 30 }),
        rij({ dagen: 40, soort: "vervangen" }),
        rij({ dagen: 50, soort: "afgezegd" }),
        rij({ dagen: 60, soort: "nietOpgekomen" }),
        rij({ dagen: 70, soort: "bedrijf" }),
      ],
      NU,
    );
    expect(p).toEqual({ gematcht: 6, nietVoltooid: 2, vervanging: 1, zelf: 3, compleetPct: 67, zelfPct: 50 });
  });

  it("geeft geen percentage bij te weinig klussen (dan staat er Nieuw op ZekerFlex), wel de aantallen", () => {
    const p = telPrestaties([rij({ dagen: 10 }), rij({ dagen: 20 })], NU);
    expect(p.gematcht).toBe(2);
    expect(p.gematcht).toBeLessThan(MIN_VOOR_PERCENTAGE);
    expect(p.compleetPct).toBeNull();
    expect(p.zelfPct).toBeNull();
    expect(telPrestaties([], NU)).toMatchObject({ gematcht: 0, compleetPct: null, zelfPct: null });
  });

  it("kijkt alleen naar klussen die in de laatste 6 maanden afliepen, niet naar oudere of toekomstige", () => {
    const p = telPrestaties([rij({ dagen: 5 }), rij({ dagen: 100 }), rij({ dagen: 180 }), rij({ dagen: 200, soort: "afgezegd" }), rij({ dagen: -3 })], NU);
    expect(p).toMatchObject({ gematcht: 3, nietVoltooid: 0, zelf: 3, compleetPct: 100, zelfPct: 100 });
  });

  it("een klus zonder uren is de eerste week nog onbekend en telt daarna als niet voltooid", () => {
    const basis = [rij({ dagen: 30 }), rij({ dagen: 31 }), rij({ dagen: 32 })];
    expect(telPrestaties([...basis, rij({ dagen: 3, soort: "geenUren" })], NU)).toMatchObject({ gematcht: 3, nietVoltooid: 0 });
    expect(telPrestaties([...basis, rij({ dagen: 9, soort: "geenUren" })], NU)).toMatchObject({ gematcht: 4, nietVoltooid: 1, compleetPct: 75 });
  });

  it("zelf aanwezig is nooit hoger dan compleet: een vervanger maakt de klus compleet, maar niet zelf gewerkt", () => {
    const p = telPrestaties([rij({ dagen: 10 }), rij({ dagen: 20, soort: "vervangen" }), rij({ dagen: 30, soort: "vervangen" }), rij({ dagen: 40 })], NU);
    expect(p.compleetPct).toBe(100);
    expect(p.zelfPct).toBe(50);
  });
});

describe("gewerkteUrenBij: uren bij dit bedrijf in 12 maanden", () => {
  it("telt goedgekeurde minuten, anders de geplande tijd zonder pauze; alleen zelf gewerkt bij dit bedrijf", () => {
    const uren = gewerkteUrenBij(
      [
        rij({ dagen: 10, minuten: 420 }), // 7 uur
        rij({ dagen: 20 }), // 8 uur gepland min 30 min pauze = 7,5
        rij({ dagen: 30, tenantId: "ander" }),
        rij({ dagen: 40, soort: "vervangen" }),
        rij({ dagen: 400, minuten: 480 }), // ouder dan een jaar
        rij({ dagen: -5 }), // nog niet gewerkt
      ],
      "t1",
      NU,
    );
    expect(uren).toBe(14.5);
    expect(gewerkteUrenBij([], "t1", NU)).toBe(0);
  });
});

describe("actieveRegios: plaatsen waar in 12 maanden is gewerkt", () => {
  it("één regel per plaats met het aantal klussen, het punt afgerond, zonder verborgen bedrijven en zonder gemiste klussen", () => {
    const regios = actieveRegios(
      [
        rij({ dagen: 10, city: "Utrecht", lat: 52.0907, lng: 5.1214 }),
        rij({ dagen: 20, city: "utrecht ", lat: 52.0811, lng: 5.1302 }),
        rij({ dagen: 30, city: "Almere", lat: 52.3508, lng: 5.2647 }),
        rij({ dagen: 40, city: "Zwolle", soort: "afgezegd" }),
        rij({ dagen: 50, city: "Geheimstad", tenantId: "eigen-test" }),
        rij({ dagen: 500, city: "Breda" }),
      ],
      NU,
      new Set(["eigen-test"]),
    );
    expect(regios).toEqual([
      { naam: "Utrecht", lat: 52.09, lng: 5.13, klussen: 2 },
      { naam: "Almere", lat: 52.35, lng: 5.26, klussen: 1 },
    ]);
  });

  it("wie nog nergens werkte heeft geen regio's (de link staat er dan niet)", () => {
    expect(actieveRegios([rij({ dagen: -2 }), rij({ dagen: 12, soort: "bedrijf" })], NU)).toEqual([]);
  });
});

describe("ervaring en planning", () => {
  it("ervaring in dezelfde sector en functie komt alleen uit klussen die zelf zijn gewerkt", () => {
    const rijen = [rij({ dagen: 10, title: "Magazijnmedewerker", skill: "Orderpicken" }), rij({ dagen: 20, title: "Bediening terras", soort: "afgezegd" })];
    expect(ervaringIn(rijen, { title: "Orderpicker avond", skill: "Orderpicken" }, NU)).toEqual({ sector: true, functie: true });
    expect(ervaringIn(rijen, { title: "Heftruckchauffeur", skill: "Heftruck" }, NU)).toEqual({ sector: true, functie: false });
    expect(ervaringIn(rijen, { title: "Bediening", skill: null }, NU)).toEqual({ sector: false, functie: false });
  });

  it("al gematcht op deze dag: een andere klus van hetzelfde bedrijf die dag, niet deze klus en niet een geannuleerde", () => {
    const dagStart = new Date("2026-12-08T00:00:00+01:00");
    const dagEind = new Date("2026-12-09T00:00:00+01:00");
    const op = (o: Partial<PrestatieRij> & { uur: string }): PrestatieRij => ({ ...rij({ dagen: 0 }), ...o, shift: { ...rij({ dagen: 0 }).shift, startsAt: new Date(`2026-12-08T${o.uur}:00+01:00`), endsAt: new Date("2026-12-08T23:00:00+01:00") } });
    const klus = { id: "deze", tenantId: "t1" };
    expect(alGematchtOpDag([op({ uur: "18:00", shiftId: "andere", timesheet: null })], klus, dagStart, dagEind)).toBe(true);
    expect(alGematchtOpDag([op({ uur: "18:00", shiftId: "deze", timesheet: null })], klus, dagStart, dagEind)).toBe(false);
    expect(alGematchtOpDag([op({ uur: "18:00", shiftId: "andere", tenantId: "ander", timesheet: null })], klus, dagStart, dagEind)).toBe(false);
    expect(alGematchtOpDag([op({ uur: "18:00", shiftId: "andere", cancelledAt: new Date(), timesheet: null })], klus, dagStart, dagEind)).toBe(false);
  });
});

describe("profielkaart: beoordelingen per sector en functie", () => {
  const klussen = new Map([
    ["k1", { title: "Bediening", skill: "Bediening", tenantId: "t1", bedrijf: "Café Noord" }],
    ["k2", { title: "Bediening zaterdag", skill: "Bediening", tenantId: "t2", bedrijf: "Brasserie Zuid" }],
    ["k3", { title: "Orderpicker", skill: null, tenantId: "t3", bedrijf: "Hal 9" }],
    ["k4", { title: "Bediening", skill: "Bediening", tenantId: "eigen-test", bedrijf: "Proefbedrijf" }],
  ]);

  it("groepeert per sector en functie met het gemiddelde, het aantal en bij welke bedrijven", () => {
    const groepen = groepeerReviews(
      [
        { rating: 5, shiftId: "k1" },
        { rating: 4, shiftId: "k1" },
        { rating: 5, shiftId: "k2" },
        { rating: 3, shiftId: "k3" },
        { rating: 1, shiftId: "k4" },
        { rating: 5 },
        { rating: 5, shiftId: "bestaat-niet" },
      ],
      klussen,
      new Set(["eigen-test"]),
    );
    expect(groepen).toHaveLength(2);
    expect(groepen[0]).toMatchObject({ sector: "Horeca", functie: "Bediening", average: 4.7, count: 3 });
    expect(groepen[0]?.bedrijven).toEqual([
      { naam: "Café Noord", aantal: 2 },
      { naam: "Brasserie Zuid", aantal: 1 },
    ]);
    expect(groepen[1]).toMatchObject({ sector: "Logistiek", functie: null, average: 3, count: 1 });
  });

  it("gewerkt bij: elk bedrijf één keer, zonder verborgen bedrijven", () => {
    expect(
      gewerktBij(
        [
          { tenantId: "t1", bedrijf: "Café Noord" },
          { tenantId: "t1", bedrijf: "Café Noord" },
          { tenantId: "eigen-test", bedrijf: "Proefbedrijf" },
          { tenantId: "t2", bedrijf: "Brasserie Zuid" },
        ],
        new Set(["eigen-test"]),
      ),
    ).toEqual(["Café Noord", "Brasserie Zuid"]);
  });
});
