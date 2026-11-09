import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bewaarTik,
  laadTikken,
  leesTikken,
  opVolgorde,
  opgeruimd,
  sleutelVoor,
  uitkomstVan,
  wisTikken,
  OPRUIMEN_NA_MS,
  type BewaardeTik,
} from "@/lib/checkin/wachtrij";
import { verstuurBewaard, weigerTekst } from "@/lib/checkin/verzenden";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { OFFLINE_MELDING } from "@/lib/timesheets/offline";

// De telefoon-kant van inchecken zonder bereik: bewaren per gebruiker, in
// volgorde versturen met de bewaarde plek en tijd, stoppen zonder bereik,
// weg na aankomst of weigering, en wissen bij uitloggen.

class Opslag implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

const tikIn: BewaardeTik = {
  id: "11111111-aaaa-4bbb-8ccc-000000000001",
  timesheetId: "ts1",
  type: "CHECK_IN",
  tikOp: "2026-11-09T07:02:00.000Z",
  latitude: 52.3676,
  longitude: 4.9041,
  accuracyMeters: 12,
  deviceHash: "toestel-1234",
};
const tikUit: BewaardeTik = { ...tikIn, id: "11111111-aaaa-4bbb-8ccc-000000000002", type: "CHECK_OUT", tikOp: "2026-11-09T15:30:00.000Z", latitude: 52.3677 };
const NU = new Date("2026-11-09T16:00:00.000Z");

type Antwoord = { status: number; body: unknown } | "netwerk";
function nepFetch(antwoorden: Antwoord[]) {
  const verzonden: { url: string; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    verzonden.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const a = antwoorden.shift() ?? "netwerk";
    if (a === "netwerk") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "Content-Type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, verzonden };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new Opslag());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wat een antwoord betekent", () => {
  it("geen netwerk, 5xx, 401, 408, 429: later opnieuw; 2xx aangekomen; andere 4xx geweigerd", () => {
    expect(uitkomstVan(null)).toBe("opnieuw");
    expect(uitkomstVan(502)).toBe("opnieuw");
    expect(uitkomstVan(401)).toBe("opnieuw");
    expect(uitkomstVan(429)).toBe("opnieuw");
    expect(uitkomstVan(201)).toBe("aangekomen");
    expect(uitkomstVan(200)).toBe("aangekomen");
    expect(uitkomstVan(422)).toBe("geweigerd");
    expect(uitkomstVan(409)).toBe("geweigerd");
    expect(uitkomstVan(423)).toBe("geweigerd");
  });
});

describe("de wachtrij op het toestel", () => {
  it("per gebruiker een eigen sleutel; rommel valt weg", () => {
    expect(bewaarTik("u1", tikIn)).toBe(true);
    expect(laadTikken("u1")).toEqual([tikIn]);
    expect(laadTikken("u2")).toEqual([]);
    expect(localStorage.getItem(sleutelVoor("u1"))).toContain(tikIn.id);
    expect(leesTikken('[{"id":1},{"nee":true}]')).toEqual([]);
    expect(leesTikken("geen json")).toEqual([]);
  });

  it("op volgorde van tikken, inchecken eerst; na een week opgeruimd", () => {
    expect(opVolgorde([tikUit, tikIn])).toEqual([tikIn, tikUit]);
    expect(opVolgorde([{ ...tikUit, tikOp: tikIn.tikOp }, tikIn])[0]?.type).toBe("CHECK_IN");
    expect(opgeruimd([tikIn], Date.parse(tikIn.tikOp) + OPRUIMEN_NA_MS + 1)).toEqual([]);
  });

  it("uitloggen wist alles; bij openen gaan alleen de tikken van anderen weg", () => {
    bewaarTik("u1", tikIn);
    bewaarTik("u2", tikUit);
    localStorage.setItem("zf-device", "blijft");
    wisTikken("u1");
    expect(laadTikken("u1")).toHaveLength(1);
    expect(laadTikken("u2")).toEqual([]);
    wisTikken();
    expect(laadTikken("u1")).toEqual([]);
    expect(localStorage.getItem("zf-device")).toBe("blijft");
  });

  it("zonder opslag (privévenster) geeft bewaren false en gooit niets", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(bewaarTik("u1", tikIn)).toBe(false);
    expect(laadTikken("u1")).toEqual([]);
    expect(() => wisTikken()).not.toThrow();
  });
});

describe("verstuurBewaard", () => {
  it("in volgorde, met de bewaarde plek en tijd, het eigen id en bron offline", async () => {
    bewaarTik("u1", tikUit);
    bewaarTik("u1", tikIn);
    const { fn, verzonden } = nepFetch([
      { status: 201, body: { recordedAt: tikIn.tikOp, actualStart: tikIn.tikOp, withinGeofence: true, distanceToBranchMeters: 8 } },
      { status: 201, body: { recordedAt: tikUit.tikOp, actualEnd: tikUit.tikOp, withinGeofence: true, distanceToBranchMeters: 9 } },
    ]);
    const u = await verstuurBewaard("u1", { fetchFn: fn, nu: () => NU });
    expect(verzonden.map((v) => v.body.type)).toEqual(["CHECK_IN", "CHECK_OUT"]);
    expect(verzonden[0]?.url).toBe("/api/timesheets/ts1/gps");
    expect(verzonden[0]?.body).toEqual({
      type: "CHECK_IN",
      latitude: 52.3676,
      longitude: 4.9041,
      accuracyMeters: 12,
      deviceHash: "toestel-1234",
      recordedAt: tikIn.tikOp,
      clientId: tikIn.id,
      offline: true,
      verzondenOp: NU.toISOString(),
    });
    expect(verzonden[1]?.body.latitude).toBe(52.3677); // de plek van het uitchecken zelf, niet van nu
    expect(u.map((x) => x.uitkomst)).toEqual(["aangekomen", "aangekomen"]);
    expect(laadTikken("u1")).toEqual([]);
  });

  it("geen bereik: stoppen, alles blijft staan en de uitcheck gaat niet vóór de incheck", async () => {
    bewaarTik("u1", tikIn);
    bewaarTik("u1", tikUit);
    const { fn, verzonden } = nepFetch(["netwerk"]);
    expect(await verstuurBewaard("u1", { fetchFn: fn, nu: () => NU })).toEqual([]);
    expect(verzonden).toHaveLength(1);
    expect(laadTikken("u1")).toHaveLength(2);
    // de server even weg (502): ook bewaren
    const tweede = nepFetch([{ status: 502, body: {} }]);
    await verstuurBewaard("u1", { fetchFn: tweede.fn, nu: () => NU });
    expect(laadTikken("u1")).toHaveLength(2);
  });

  it("een weigering gaat van het toestel af, met de reden in de taal van de app", async () => {
    bewaarTik("u1", tikIn);
    const { fn } = nepFetch([{ status: 422, body: { error: { code: "VALIDATION_FAILED", message: "Deze registratie is langer dan 12 uur geleden.", details: { reden: "teOud" } } } }]);
    const [u] = await verstuurBewaard("u1", { fetchFn: fn, nu: () => NU });
    expect(u).toMatchObject({ uitkomst: "geweigerd", reden: "teOud" });
    expect(laadTikken("u1")).toEqual([]);
    expect(weigerTekst(FREELANCER_DICTS.pl.checkin, u ?? { reden: null, melding: null })).toBe(FREELANCER_DICTS.pl.checkin.offlineReden.teOud);
    // een onbekende reden (of "constructor"): de melding van de server
    expect(weigerTekst(FREELANCER_DICTS.nl.checkin, { reden: "constructor", melding: "Je bent al ingecheckt voor deze dienst." })).toBe("Je bent al ingecheckt voor deze dienst.");
  });

  it("twee keer tegelijk aanroepen verstuurt elke tik één keer", async () => {
    bewaarTik("u1", tikIn);
    const { fn, verzonden } = nepFetch([{ status: 201, body: { recordedAt: tikIn.tikOp } }]);
    const [a, b] = await Promise.all([verstuurBewaard("u1", { fetchFn: fn, nu: () => NU }), verstuurBewaard("u1", { fetchFn: fn, nu: () => NU })]);
    expect(verzonden).toHaveLength(1);
    expect([...(a ?? []), ...(b ?? [])]).toHaveLength(1);
  });
});

describe("teksten in vijf talen", () => {
  it("elke taal heeft de meldingen voor bewaard, aangekomen en elke reden", () => {
    for (const d of Object.values(FREELANCER_DICTS)) {
      expect(d.checkin.savedIn("08:02")).toContain("08:02");
      expect(d.checkin.arrivedOut("16:30")).toContain("16:30");
      // dezelfde redenen als de server geeft (details.reden)
      expect(Object.keys(d.checkin.offlineReden).sort()).toEqual(Object.keys(OFFLINE_MELDING).sort());
    }
    expect(FREELANCER_DICTS.nl.checkin.savedIn("08:02")).toBe("Ingecheckt om 08:02 — wordt verstuurd zodra je bereik hebt.");
  });
});
