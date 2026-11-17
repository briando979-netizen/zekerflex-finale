import { describe, expect, it } from "vitest";
import {
  AFGEZEGD_DOOR_WERKER,
  RESERVEBANK_MAX,
  bankHoortBij,
  legeReservebank,
  leesReservebank,
  metGemeld,
  metReserve,
  reservebankOpen,
  reservebankToegang,
  reservesVan,
  zonderReserve,
  type Reservebank,
} from "@/lib/reservebank/kern";

// Reservebank (17 nov 2026, eigenaar: "altijd vervanging paraat"): extra reacties achter de hand houden in plaats van
// afwijzen, en bij een afzegging er met één klik een inplannen. Hier de pure regels: wie er op de bank staat, wat er
// wegvalt (geaccepteerd, ingetrokken, een begonnen klus) en wie de bank mag zien of aanpassen.

const KLUS = { id: "sh1", tenantId: "t1", startsAt: new Date("2026-11-20T09:00:00+01:00"), status: "FILLED" };
const VOOR = new Date("2026-11-19T15:00:00+01:00");
const NA = new Date("2026-11-20T09:05:00+01:00");

function bank(reserves: string[], extra: Partial<Reservebank> = {}): Reservebank {
  return { ...legeReservebank("sh1", "t1"), reserves: reserves.map((offerId) => ({ offerId, at: "2026-11-18T10:00:00.000Z" })), ...extra };
}

const reactie = (id: string, status = "pending", shiftId = "sh1") => ({ id, shiftId, status });

describe("reservebank: inlezen", () => {
  it("een onleesbare waarde is geen bank", () => {
    expect(leesReservebank(null)).toBeNull();
    expect(leesReservebank("x")).toBeNull();
    expect(leesReservebank([])).toBeNull();
    expect(leesReservebank({ shiftId: "sh1" })).toBeNull(); // zonder bedrijf telt hij niet
  });

  it("slaat kapotte en dubbele regels over en houdt de rest", () => {
    const b = leesReservebank({
      shiftId: "sh1",
      tenantId: "t1",
      versie: 3,
      reserves: [{ offerId: "o1", at: "2026-11-18T10:00:00.000Z" }, null, 7, { offerId: "" }, { offerId: "o1" }, { offerId: "o2" }],
      gemeld: ["a1", 5, "a1"],
    });
    expect(b?.versie).toBe(3);
    expect(b?.reserves.map((r) => r.offerId)).toEqual(["o1", "o2"]);
    expect(b?.gemeld).toEqual(["a1"]);
  });
});

describe("reservebank: hoort bij de klus van dit bedrijf", () => {
  it("alleen een bank met dezelfde klus én hetzelfde bedrijf telt", () => {
    expect(bankHoortBij(bank(["o1"]), KLUS)).toBe(true);
    expect(bankHoortBij({ ...bank(["o1"]), tenantId: "ander" }, KLUS)).toBe(false);
    expect(bankHoortBij({ ...bank(["o1"]), shiftId: "sh2" }, KLUS)).toBe(false);
    expect(bankHoortBij(null, KLUS)).toBe(false);
  });

  it("de bank van een ander bedrijf levert geen reserves op", () => {
    expect(reservesVan({ ...bank(["o1"]), tenantId: "ander" }, KLUS, [reactie("o1")], VOOR)).toEqual([]);
  });
});

describe("reservebank: wie er nu echt beschikbaar is", () => {
  it("geeft de open reacties op de bank, in de volgorde van de bank", () => {
    expect(reservesVan(bank(["o2", "o1"]), KLUS, [reactie("o1"), reactie("o2"), reactie("o3")], VOOR)).toEqual(["o2", "o1"]);
  });

  it("laat geaccepteerde, afgewezen, ingetrokken en vervallen reacties weg", () => {
    const reacties = [reactie("o1", "accepted"), reactie("o2", "withdrawn"), reactie("o3", "declined"), reactie("o4", "expired"), reactie("o5")];
    expect(reservesVan(bank(["o1", "o2", "o3", "o4", "o5"]), KLUS, reacties, VOOR)).toEqual(["o5"]);
  });

  it("laat een reactie op een andere klus en een onbekende reactie weg", () => {
    expect(reservesVan(bank(["o1", "o9"]), KLUS, [reactie("o1", "pending", "sh2")], VOOR)).toEqual([]);
  });

  it("na de start, of bij een geannuleerde klus, telt de bank niet meer", () => {
    expect(reservesVan(bank(["o1"]), KLUS, [reactie("o1")], NA)).toEqual([]);
    expect(reservesVan(bank(["o1"]), { ...KLUS, status: "CANCELLED" }, [reactie("o1")], VOOR)).toEqual([]);
    expect(reservebankOpen(KLUS, VOOR)).toBe(true);
    expect(reservebankOpen(KLUS, KLUS.startsAt)).toBe(false); // precies op de start: niet meer
    expect(reservebankOpen({ ...KLUS, status: "COMPLETED" }, VOOR)).toBe(false);
    expect(reservebankOpen({ ...KLUS, status: "IN_PROGRESS" }, VOOR)).toBe(false);
  });
});

describe("reservebank: op en af", () => {
  it("zet een reactie er één keer op, met het moment", () => {
    const een = metReserve(legeReservebank("sh1", "t1"), "o1", VOOR);
    expect(een?.reserves).toEqual([{ offerId: "o1", at: VOOR.toISOString() }]);
    expect(metReserve(een!, "o1", VOOR)).toBeNull(); // stond er al: niets te doen
  });

  it("een volle bank neemt er geen bij", () => {
    const vol = bank(Array.from({ length: RESERVEBANK_MAX }, (_, i) => `o${i}`));
    expect(metReserve(vol, "nieuw", VOOR)).toBeNull();
  });

  it("haalt er een af, en laat de rest staan", () => {
    expect(zonderReserve(bank(["o1", "o2"]), "o1")?.reserves.map((r) => r.offerId)).toEqual(["o2"]);
    expect(zonderReserve(bank(["o2"]), "o1")).toBeNull();
  });

  it("onthoudt een afzegging, zodat de reserves er maar één seintje voor krijgen", () => {
    const gemeld = metGemeld(bank(["o1"]), "a1");
    expect(gemeld?.gemeld).toEqual(["a1"]);
    expect(metGemeld(gemeld!, "a1")).toBeNull();
    expect(metGemeld(gemeld!, "a2")?.gemeld).toEqual(["a1", "a2"]); // een tweede afzegging mag wel
  });
});

describe("reservebank: wie mag hem zien of aanpassen", () => {
  const klus = { tenantId: "t1", branchId: "b1" };

  it("het bedrijf zelf past hem aan: HQ, of de manager van die vestiging", () => {
    expect(reservebankToegang([{ role: "HQ_ADMIN", organizationId: "t1", locationIds: [] }], klus)).toBe("schrijven");
    expect(reservebankToegang([{ role: "LOCAL_MANAGER", organizationId: "t1", locationIds: ["b1"] }], klus)).toBe("schrijven");
    expect(reservebankToegang([{ role: "LOCAL_MANAGER", organizationId: "t1", locationIds: [] }], klus)).toBe("schrijven");
  });

  it("het beheer van ZekerFlex en een ander lid van het bedrijf mogen alleen lezen", () => {
    expect(reservebankToegang([{ role: "PLATFORM_ADMIN", organizationId: "zekerflex", locationIds: [] }], klus)).toBe("lezen");
    expect(reservebankToegang([{ role: "DISPUTE_MANAGER", organizationId: "t1", locationIds: [] }], klus)).toBe("lezen");
  });

  it("een ander bedrijf of een andere vestiging: niets", () => {
    expect(reservebankToegang([{ role: "HQ_ADMIN", organizationId: "t2", locationIds: [] }], klus)).toBeNull();
    expect(reservebankToegang([{ role: "LOCAL_MANAGER", organizationId: "t1", locationIds: ["b2"] }], klus)).toBeNull();
    expect(reservebankToegang([], klus)).toBeNull();
  });
});

describe("reservebank: een afzegging herkennen", () => {
  it("volgt het begin van cancelReason uit de afzegroute (zoals lib/profile/card.ts)", () => {
    expect("Afgezegd door flexwerker (buiten de opzegtermijn): ziek".startsWith(AFGEZEGD_DOOR_WERKER)).toBe(true);
    expect("Geannuleerd door opdrachtgever: weer".startsWith(AFGEZEGD_DOOR_WERKER)).toBe(false);
  });
});
