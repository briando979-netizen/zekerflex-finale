import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
  tenant: "t1" as string | undefined,
  limiet: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));
vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      if (!m.ingelogd) throw AppError.unauthenticated();
      return { userId: "u1" };
    },
    hasRole: () => m.admin,
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: m.tenant ? [m.tenant] : [] }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.limiet(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));

import * as lijst from "@/app/api/werkgever/ritten/route";
import * as een from "@/app/api/werkgever/ritten/[id]/route";
import * as wisKlant from "@/app/api/werkgever/ritten/[id]/wis-klant/route";
import * as voertuigen from "@/app/api/werkgever/ritten/voertuigen/route";
import * as chauffeurs from "@/app/api/werkgever/ritten/chauffeurs/route";
import * as wisChauffeur from "@/app/api/werkgever/ritten/chauffeurs/wis/route";

const url = (p: string) => `http://app:3000${p}`;
const json = (method: string, p: string, body?: unknown) => new Request(url(p), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

const rit = (over: Record<string, unknown> = {}) => ({ start: "2026-11-12T09:00", eind: "2026-11-12T11:00", van: "Rotterdam", naar: "Utrecht", klantNaam: "Jansen BV", ...over });
const maakRit = async (over: Record<string, unknown> = {}) => lees(await lijst.POST(json("POST", "/api/werkgever/ritten", rit(over))));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.tenant = "t1";
  m.limiet.mockReset().mockResolvedValue(undefined);
  m.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("toegang", () => {
  it("niet ingelogd geeft 401", async () => {
    m.ingelogd = false;
    expect((await lijst.GET(json("GET", "/api/werkgever/ritten"))).status).toBe(401);
  });
  it("een lid zonder beheerdersrol krijgt overal 423 met een eigen code, geen 403", async () => {
    m.admin = false;
    const antwoorden = [
      await lijst.GET(json("GET", "/api/werkgever/ritten")),
      await lijst.POST(json("POST", "/api/werkgever/ritten", rit())),
      await een.GET(json("GET", "/x"), ctx("2026-0001")),
      await een.PUT(json("PUT", "/x", rit()), ctx("2026-0001")),
      await een.PATCH(json("PATCH", "/x", { status: "onderweg" }), ctx("2026-0001")),
      await een.DELETE(json("DELETE", "/x"), ctx("2026-0001")),
      await wisKlant.POST(json("POST", "/x"), ctx("2026-0001")),
      await voertuigen.GET(),
      await voertuigen.POST(json("POST", "/x", {})),
      await chauffeurs.PUT(json("PUT", "/x", { namen: [] })),
      await wisChauffeur.POST(json("POST", "/x", { naam: "Piet" })),
    ];
    for (const res of antwoorden) {
      expect(res.status).toBe(423);
      expect((await lees(res)).error.code).toBe("ALLEEN_BEHEERDER");
    }
  });
  it("zonder organisatie: niet gevonden", async () => {
    m.tenant = undefined;
    expect((await lijst.GET(json("GET", "/api/werkgever/ritten"))).status).toBe(404);
  });
  it("een andere organisatie ziet en raakt de ritten niet", async () => {
    const { rit: r } = await maakRit();
    m.tenant = "t2";
    expect((await lees(await lijst.GET(json("GET", "/api/werkgever/ritten?van=2026-11-09&tot=2026-11-15")))).ritten).toEqual([]);
    expect((await een.GET(json("GET", "/x"), ctx(r.id))).status).toBe(404);
    expect((await een.PATCH(json("PATCH", "/x", { status: "onderweg" }), ctx(r.id))).status).toBe(404);
    expect((await een.DELETE(json("DELETE", "/x"), ctx(r.id))).status).toBe(404);
    expect((await wisKlant.POST(json("POST", "/x"), ctx(r.id))).status).toBe(404);
  });
});

describe("ritten", () => {
  it("maakt een rit (201), toont hem in de week en geeft totalen, APK en lijsten mee", async () => {
    await voertuigen.POST(json("POST", "/x", { kenteken: "AB-12-CD", omschrijving: "Bus", apk: "2026-11-20" }));
    const b = await maakRit();
    expect(b.rit).toMatchObject({ nummer: "R-2026-0001", status: "gepland", start: "2026-11-12T08:00:00.000Z" });
    const l = await lees(await lijst.GET(json("GET", "/api/werkgever/ritten")));
    expect(l.van).toBe("2026-11-09");
    expect(l.tot).toBe("2026-11-15");
    expect(l.ritten).toHaveLength(1);
    expect(l.totalen.totaal).toEqual({ aantal: 1, uren: 2, km: 0 });
    expect(l.voertuigen).toHaveLength(1);
    expect(l.apk[0]).toMatchObject({ dagen: 8 });
  });
  it("filtert op periode, status, voertuig en chauffeur; de totalen blijven die van de hele periode", async () => {
    await chauffeurs.PUT(json("PUT", "/x", { namen: ["Piet", "Kees"] }));
    const v = (await lees(await voertuigen.POST(json("POST", "/x", { kenteken: "AB12CD", omschrijving: "Bus" })))).voertuig;
    await maakRit({ chauffeur: "Piet", voertuigId: v.id });
    const tweede = await maakRit({ chauffeur: "Kees", start: "2026-11-13T09:00", eind: "2026-11-13T10:00" });
    await een.PATCH(json("PATCH", "/x", { status: "onderweg" }), ctx(tweede.rit.id));
    const haal = async (q: string) => lees(await lijst.GET(json("GET", `/api/werkgever/ritten?van=2026-11-09&tot=2026-11-15${q}`)));
    expect((await haal("")).ritten).toHaveLength(2);
    expect((await haal("&status=onderweg")).ritten).toHaveLength(1);
    expect((await haal(`&voertuig=${v.id}`)).ritten).toHaveLength(1);
    expect((await haal("&chauffeur=Kees")).ritten).toHaveLength(1);
    expect((await haal("&chauffeur=Kees")).totalen.totaal.aantal).toBe(2);
    expect((await lees(await lijst.GET(json("GET", "/api/werkgever/ritten?van=2026-11-16&tot=2026-11-16")))).ritten).toEqual([]);
  });
  it("geeft een waarschuwing bij een dubbele boeking maar slaat toch op", async () => {
    await chauffeurs.PUT(json("PUT", "/x", { namen: ["Piet"] }));
    await maakRit({ chauffeur: "Piet" });
    const b = await maakRit({ chauffeur: "Piet", start: "2026-11-12T10:00", eind: "2026-11-12T12:00" });
    expect(b.waarschuwingen[0]).toContain("Piet");
    const l = await lees(await lijst.GET(json("GET", "/api/werkgever/ritten")));
    expect(Object.keys(l.waarschuwingen)).toHaveLength(2);
  });
  it("een ongeldige periode, status of voertuig geeft 422", async () => {
    for (const q of ["?van=2026-11-01&tot=2026-12-05", "?van=2026-11-05&tot=2026-11-01", "?van=x&tot=y", "?status=constructor", "?voertuig=../x"]) {
      expect((await lijst.GET(json("GET", `/api/werkgever/ritten${q}`))).status).toBe(422);
    }
  });
  it("einde voor begin geeft 422 en maakt niets", async () => {
    const res = await lijst.POST(json("POST", "/api/werkgever/ritten", rit({ eind: "2026-11-12T08:00" })));
    expect(res.status).toBe(422);
    expect((await lees(await lijst.GET(json("GET", "/api/werkgever/ritten")))).ritten).toEqual([]);
  });
  it("een rit over middernacht komt op de dag van het begin", async () => {
    await maakRit({ start: "2026-11-12T22:00", eind: "2026-11-13T04:00" });
    const l = await lees(await lijst.GET(json("GET", "/api/werkgever/ritten?van=2026-11-12&tot=2026-11-12")));
    expect(l.ritten).toHaveLength(1);
    expect(l.totalen.totaal.uren).toBe(6);
  });
  it("ongeldige id's geven 404, ook constructor", async () => {
    for (const id of ["constructor", "../x", "2026-1", "abc"]) {
      expect((await een.GET(json("GET", "/x"), ctx(id))).status).toBe(404);
      expect((await een.PUT(json("PUT", "/x", rit()), ctx(id))).status).toBe(404);
      expect((await een.PATCH(json("PATCH", "/x", { status: "onderweg" }), ctx(id))).status).toBe(404);
      expect((await een.DELETE(json("DELETE", "/x"), ctx(id))).status).toBe(404);
      expect((await wisKlant.POST(json("POST", "/x"), ctx(id))).status).toBe(404);
    }
    expect((await een.GET(json("GET", "/x"), ctx("2026-0042"))).status).toBe(404);
  });
  it("de status loopt via PATCH met de toegestane overgangen", async () => {
    const { rit: r } = await maakRit();
    const o = await lees(await een.PATCH(json("PATCH", "/x", { status: "onderweg" }), ctx(r.id)));
    expect(o.rit).toMatchObject({ status: "onderweg", werkelijkStart: "2026-11-12T06:00:00.000Z" });
    expect((await een.PATCH(json("PATCH", "/x", { status: "bestaatniet" }), ctx(r.id))).status).toBe(422);
    expect((await een.PATCH(json("PATCH", "/x", { status: "constructor" }), ctx(r.id))).status).toBe(422);
    expect((await een.PATCH(json("PATCH", "/x", {}), ctx(r.id))).status).toBe(422);
    expect((await een.DELETE(json("DELETE", "/x"), ctx(r.id))).status).toBe(409); // onderweg
    await een.PATCH(json("PATCH", "/x", { status: "geannuleerd" }), ctx(r.id));
    expect((await een.DELETE(json("DELETE", "/x"), ctx(r.id))).status).toBe(200);
  });
  it("PUT past een rit aan en geeft de uren terug", async () => {
    const { rit: r } = await maakRit();
    const w = await lees(await een.PUT(json("PUT", "/x", rit({ eind: "2026-11-12T10:30", km: 80 })), ctx(r.id)));
    expect(w.rit).toMatchObject({ km: 80, nummer: r.nummer });
    expect(w.uren).toBe(1.5);
  });
  it("een kapot verzoek geeft 422 en schrijft niet", async () => {
    const res = await lijst.POST(new Request(url("/api/werkgever/ritten"), { method: "POST", body: "{kapot" }));
    expect(res.status).toBe(422);
  });
  it("de schrijfbegrenzing wordt per gebruiker toegepast", async () => {
    await maakRit();
    expect(m.limiet).toHaveBeenCalledWith(expect.objectContaining({ name: "ritten-schrijven", identifier: "u1" }));
  });
});

describe("voertuigen", () => {
  it("maakt, bewerkt en archiveert een voertuig", async () => {
    const b = await lees(await voertuigen.POST(json("POST", "/x", { kenteken: "ab-12-cd", omschrijving: "Bestelbus Ford Transit", laadvermogenKg: 1200 })));
    expect(b.voertuig).toMatchObject({ kenteken: "AB12CD", laadvermogenKg: 1200, gearchiveerd: false });
    const w = await lees(await voertuigen.PUT(json("PUT", "/x", { id: b.voertuig.id, kenteken: "AB12CD", omschrijving: "Bus 2", apk: "2027-02-01" })));
    expect(w.voertuig).toMatchObject({ omschrijving: "Bus 2", apk: "2027-02-01" });
    const a = await lees(await voertuigen.PATCH(json("PATCH", "/x", { id: b.voertuig.id, gearchiveerd: true })));
    expect(a.voertuig.gearchiveerd).toBe(true);
    expect((await lees(await voertuigen.GET())).voertuigen).toHaveLength(1);
  });
  it("een dubbel kenteken geeft 409, een kapot kenteken 422, een rare id 404", async () => {
    await voertuigen.POST(json("POST", "/x", { kenteken: "AB12CD", omschrijving: "Bus" }));
    expect((await voertuigen.POST(json("POST", "/x", { kenteken: "AB-12-CD", omschrijving: "Bus" }))).status).toBe(409);
    expect((await voertuigen.POST(json("POST", "/x", { kenteken: "AB", omschrijving: "Bus" }))).status).toBe(422);
    expect((await voertuigen.PUT(json("PUT", "/x", { id: "constructor", kenteken: "AB12CD", omschrijving: "Bus" }))).status).toBe(404);
    expect((await voertuigen.PATCH(json("PATCH", "/x", { id: "00000000" }))).status).toBe(422);
  });
  it("een andere organisatie mag hetzelfde kenteken en ziet het voertuig niet", async () => {
    await voertuigen.POST(json("POST", "/x", { kenteken: "AB12CD", omschrijving: "Bus" }));
    m.tenant = "t2";
    expect((await lees(await voertuigen.GET())).voertuigen).toEqual([]);
    expect((await voertuigen.POST(json("POST", "/x", { kenteken: "AB12CD", omschrijving: "Bus" }))).status).toBe(201);
  });
});

describe("persoonsgegevens wissen", () => {
  it("klantgegevens wissen: naam en adressen weg, rit blijft, audit zonder naam", async () => {
    const { rit: r } = await maakRit();
    const w = await lees(await wisKlant.POST(json("POST", "/x"), ctx(r.id)));
    expect(w.rit).toMatchObject({ klantNaam: "", van: "", naar: "", klantGewist: true });
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("Jansen");
  });
  it("een chauffeur wissen vervangt de naam in de ritten en meldt het aantal; audit zonder naam", async () => {
    await chauffeurs.PUT(json("PUT", "/x", { namen: ["Piet"] }));
    await maakRit({ chauffeur: "Piet" });
    await maakRit({ chauffeur: "Piet", start: "2026-11-13T09:00", eind: "2026-11-13T10:00" });
    const w = await lees(await wisChauffeur.POST(json("POST", "/x", { naam: "Piet" })));
    expect(w).toMatchObject({ ritten: 2, chauffeurs: [] });
    const l = await lees(await lijst.GET(json("GET", "/api/werkgever/ritten")));
    expect(l.ritten.map((r: { chauffeur: string }) => r.chauffeur)).toEqual(["Verwijderd", "Verwijderd"]);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("Piet");
    expect((await wisChauffeur.POST(json("POST", "/x", { naam: "Piet" }))).status).toBe(404);
  });
  it("de chauffeurslijst weigert te veel namen", async () => {
    const namen = Array.from({ length: 51 }, (_, i) => `Naam ${i}`);
    expect((await chauffeurs.PUT(json("PUT", "/x", { namen }))).status).toBe(422);
  });
});
