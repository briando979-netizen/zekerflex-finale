import { describe, expect, it } from "vitest";
import { beginStand, besluit, meetInterval, type AutoInvoer } from "@/lib/checkin/auto";
import { bakenToken, bakenTokenGeldig, bewijsLabel } from "@/lib/checkin/baken";

// Automatisch in- en uitchecken: voorzichtig, want een check-in bepaalt uren.

const T = Date.UTC(2026, 10, 9, 8, 0); // geplande start
const min = 60_000;
const basis: AutoInvoer = { now: T, afstandMeters: 20, nauwkeurigheidMeters: 15, geofenceMeters: 150, geplandeStart: T, geplandEinde: T + 8 * 60 * min, ingecheckt: null, uitgecheckt: null };

describe("besluit: inchecken", () => {
  it("pas na twee metingen binnen, en niet eerder dan 15 minuten voor de start", () => {
    const s1 = besluit({ ...basis, now: T - 10 * min }, beginStand());
    expect(s1.actie).toBeNull();
    const s2 = besluit({ ...basis, now: T - 9 * min }, s1.stand);
    expect(s2.actie).toBe("CHECK_IN");
    // te vroeg
    const v1 = besluit({ ...basis, now: T - 40 * min }, beginStand());
    expect(besluit({ ...basis, now: T - 39 * min }, v1.stand).actie).toBeNull();
  });

  it("een onnauwkeurige of eenmalige meting telt niet", () => {
    const s1 = besluit({ ...basis, nauwkeurigheidMeters: 400 }, beginStand());
    expect(s1).toMatchObject({ actie: null, binnen: null });
    const b = besluit(basis, beginStand());
    const buiten = besluit({ ...basis, now: T + min, afstandMeters: 900 }, b.stand);
    expect(buiten.actie).toBeNull();
    expect(besluit({ ...basis, now: T + 2 * min }, buiten.stand).actie).toBeNull(); // reeks: buiten, binnen
    expect(besluit({ ...basis, now: T + 3 * min }, besluit({ ...basis, now: T + 2 * min }, buiten.stand).stand).actie).toBe("CHECK_IN");
  });

  it("de nauwkeurigheid telt in je voordeel, tot 50 m", () => {
    const s = besluit({ ...basis, afstandMeters: 190, nauwkeurigheidMeters: 45 }, { reeks: [true], buitenSinds: null });
    expect(s.actie).toBe("CHECK_IN");
    expect(besluit({ ...basis, afstandMeters: 210, nauwkeurigheidMeters: 120 }, { reeks: [true], buitenSinds: null }).actie).toBeNull();
  });
});

describe("besluit: uitchecken", () => {
  const in_ = { ...basis, ingecheckt: T - 5 * min };

  it("na 5 minuten aaneengesloten buiten, maar niet binnen 10 minuten na het inchecken", () => {
    let s = besluit({ ...in_, now: T + 2 * min, afstandMeters: 800 }, beginStand());
    expect(s.actie).toBeNull(); // pas 7 min ingecheckt
    s = besluit({ ...in_, now: T + 6 * min, afstandMeters: 800 }, s.stand);
    expect(s.actie).toBeNull(); // 4 min buiten
    s = besluit({ ...in_, now: T + 7 * min + 1, afstandMeters: 800 }, s.stand);
    expect(s.actie).toBe("CHECK_OUT");
  });

  it("even terug binnen zet de teller op nul", () => {
    let s = besluit({ ...in_, now: T + 10 * min, afstandMeters: 800 }, beginStand());
    s = besluit({ ...in_, now: T + 13 * min, afstandMeters: 10 }, s.stand);
    expect(s.stand.buitenSinds).toBeNull();
    s = besluit({ ...in_, now: T + 16 * min, afstandMeters: 800 }, s.stand);
    expect(s.actie).toBeNull();
  });

  it("na het geplande einde meteen bij de eerste meting buiten; nooit na het uitchecken", () => {
    const einde = basis.geplandEinde;
    expect(besluit({ ...in_, now: einde + min, afstandMeters: 800 }, beginStand()).actie).toBe("CHECK_OUT");
    expect(besluit({ ...in_, now: einde + min, afstandMeters: 10 }, beginStand()).actie).toBeNull();
    expect(besluit({ ...in_, uitgecheckt: einde, now: einde + 20 * min, afstandMeters: 800 }, beginStand()).actie).toBeNull();
  });
});

describe("meetInterval", () => {
  it("vaker rond start en einde", () => {
    expect(meetInterval(T - 5 * min, T, T + 480 * min)).toBe(60_000);
    expect(meetInterval(T + 200 * min, T, T + 480 * min)).toBe(300_000);
    expect(meetInterval(T + 470 * min, T, T + 480 * min)).toBe(60_000);
  });
});

describe("bakenToken", () => {
  const secret = "een-lange-test-sleutel-van-minstens-32-tekens!!";
  it("is vast per vestiging en versie, en niet te raden", () => {
    const t = bakenToken("branch1", 1, secret);
    expect(t).toMatch(/^[0-9a-f]{24}$/);
    expect(bakenToken("branch1", 1, secret)).toBe(t);
    expect(bakenToken("branch1", 2, secret)).not.toBe(t);
    expect(bakenToken("branch2", 1, secret)).not.toBe(t);
    expect(bakenTokenGeldig("branch1", 1, t.toUpperCase(), secret)).toBe(true);
    expect(bakenTokenGeldig("branch1", 2, t, secret)).toBe(false);
    expect(bakenTokenGeldig("branch1", 1, "kort", secret)).toBe(false);
  });

  it("maakt een leesbaar label van het bewijs", () => {
    expect(bewijsLabel(undefined)).toBeNull();
    expect(bewijsLabel({ timesheetId: "t", gebeurtenissen: [{ type: "CHECK_IN", bron: "qr", at: "x" }] })).toBe("QR-code gescand");
    expect(bewijsLabel({ timesheetId: "t", gebeurtenissen: [{ type: "CHECK_IN", bron: "qr", at: "x" }, { type: "CHECK_OUT", bron: "ble", at: "y" }] })).toBe("QR-code gescand + Bluetooth-baken");
  });
});
