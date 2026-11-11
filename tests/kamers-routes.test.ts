import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
  tenant: "t1" as string | undefined,
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
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));

import * as kamers from "@/app/api/werkgever/kamers/route";
import * as boekingen from "@/app/api/werkgever/kamers/boekingen/route";

const url = (p: string) => `http://app:3000${p}`;
const json = (method: string, p: string, body?: unknown) => new Request(url(p), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

const maakKamer = async (over: Record<string, unknown> = {}) => {
  const res = await kamers.POST(json("POST", "/api/werkgever/kamers", { naam: "1", type: "Tweepersoonskamer", capaciteit: 2, prijsCent: 10_000, ...over }));
  return { res, b: await lees(res) };
};
const maakBoeking = async (kamerId: string, aankomst: string, vertrek: string, over: Record<string, unknown> = {}) => {
  const res = await boekingen.POST(json("POST", "/api/werkgever/kamers/boekingen", { kamerId, aankomst, vertrek, naam: "Jansen", personen: 2, ...over }));
  return { res, b: await lees(res) };
};
const patchBoeking = (body: unknown) => boekingen.PATCH(json("PATCH", "/api/werkgever/kamers/boekingen", body));
const patchKamer = (body: unknown) => kamers.PATCH(json("PATCH", "/api/werkgever/kamers", body));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.tenant = "t1";
  m.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("toegang", () => {
  it("niet ingelogd geeft 401", async () => {
    m.ingelogd = false;
    expect((await kamers.GET(json("GET", "/api/werkgever/kamers"))).status).toBe(401);
    expect((await boekingen.POST(json("POST", "/api/werkgever/kamers/boekingen", {}))).status).toBe(401);
  });
  it("een lid zonder beheerdersrol krijgt 423 met een eigen code, geen 403", async () => {
    m.admin = false;
    for (const res of [await kamers.GET(json("GET", "/api/werkgever/kamers")), await kamers.POST(json("POST", "/api/werkgever/kamers", {})), await patchBoeking({}), await boekingen.POST(json("POST", "/api/werkgever/kamers/boekingen", {}))]) {
      expect(res.status).toBe(423);
      expect((await lees(res)).error.code).toBe("ALLEEN_BEHEERDER");
    }
  });
  it("zonder organisatie: niet gevonden", async () => {
    m.tenant = undefined;
    expect((await kamers.GET(json("GET", "/api/werkgever/kamers"))).status).toBe(404);
  });
});

describe("kamers", () => {
  it("POST maakt een kamer, GET geeft kamers, boekingen, vandaag en de bewaartermijn zonder cache", async () => {
    const { res, b } = await maakKamer();
    expect(res.status).toBe(201);
    expect(b.kamer).toMatchObject({ naam: "1", schoon: "schoon" });
    const lijst = await kamers.GET(json("GET", "/api/werkgever/kamers"));
    expect(lijst.headers.get("cache-control")).toBe("no-store");
    expect(await lees(lijst)).toMatchObject({ vandaag: "2026-11-12", teSchonen: 0, boekingen: [] });
  });
  it("een ongeldige kamer geeft 422, een dubbele naam 409, een kapotte body 422", async () => {
    expect((await maakKamer({ capaciteit: 0 })).res.status).toBe(422);
    await maakKamer();
    expect((await maakKamer({ naam: "1" })).res.status).toBe(409);
    const kapot = await kamers.POST(new Request(url("/api/werkgever/kamers"), { method: "POST", body: "{niet json" }));
    expect(kapot.status).toBe(422);
  });
  it("de schoonmaakstatus zetten en een onbekende waarde weigeren", async () => {
    const { b } = await maakKamer();
    const r = await patchKamer({ id: b.kamer.id, actie: "schoon", schoon: "vuil" });
    expect((await lees(r)).kamer.schoon).toBe("vuil");
    expect((await patchKamer({ id: b.kamer.id, actie: "schoon", schoon: "constructor" })).status).toBe(422);
    expect((await patchKamer({ id: b.kamer.id, actie: "schoon" })).status).toBe(422);
  });
  it("archiveren met een toekomstige boeking wordt geweigerd met uitleg", async () => {
    const { b } = await maakKamer();
    await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-03");
    const r = await patchKamer({ id: b.kamer.id, actie: "archiveren" });
    expect(r.status).toBe(409);
    expect((await lees(r)).error.message).toMatch(/K-2026-0001/);
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("archiveren, terughalen en wissen komen in het auditspoor zonder persoonsgegevens", async () => {
    const { b } = await maakKamer();
    expect((await lees(await patchKamer({ id: b.kamer.id, actie: "archiveren" }))).kamer.gearchiveerd).toBe(true);
    expect((await lees(await patchKamer({ id: b.kamer.id, actie: "terughalen" }))).kamer.gearchiveerd).toBe(false);
    expect((await kamers.DELETE(json("DELETE", `/api/werkgever/kamers?id=${b.kamer.id}`))).status).toBe(200);
    expect(m.audit).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/Jansen/);
  });
  it("een andere organisatie ziet de kamer niet en kan hem niet wijzigen of wissen", async () => {
    const { b } = await maakKamer();
    m.tenant = "t2";
    expect((await lees(await kamers.GET(json("GET", "/api/werkgever/kamers")))).kamers).toEqual([]);
    expect((await patchKamer({ id: b.kamer.id, actie: "archiveren" })).status).toBe(404);
    expect((await kamers.DELETE(json("DELETE", `/api/werkgever/kamers?id=${b.kamer.id}`))).status).toBe(404);
  });
  it("ongeldige id's en een onbekende actie", async () => {
    for (const id of ["constructor", "__proto__", "", 5, null, "../../x"]) expect((await patchKamer({ id, actie: "archiveren" })).status).toBe(404);
    expect((await kamers.DELETE(json("DELETE", "/api/werkgever/kamers?id=constructor"))).status).toBe(404);
    expect((await kamers.DELETE(json("DELETE", "/api/werkgever/kamers"))).status).toBe(404);
    const { b } = await maakKamer();
    expect((await patchKamer({ id: b.kamer.id, actie: "constructor" })).status).toBe(422);
  });
});

describe("boekingen", () => {
  it("een boeking maken met volgnummer en een dubbele boeking weigeren", async () => {
    const { b } = await maakKamer();
    const x = await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-04");
    expect(x.res.status).toBe(201);
    expect(x.b.boeking.nummer).toBe("K-2026-0001");
    const dubbel = await maakBoeking(b.kamer.id, "2026-12-03", "2026-12-05");
    expect(dubbel.res.status).toBe(409);
    expect(dubbel.b.error.message).toMatch(/al bezet/);
    expect((await maakBoeking(b.kamer.id, "2026-12-04", "2026-12-05")).res.status).toBe(201);
  });
  it("vertrek vóór aankomst, te veel personen en een onbekende kamer", async () => {
    const { b } = await maakKamer();
    expect((await maakBoeking(b.kamer.id, "2026-12-04", "2026-12-01")).res.status).toBe(422);
    expect((await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-04", { personen: 3 })).res.status).toBe(409);
    expect((await maakBoeking("cccccccccccc", "2026-12-01", "2026-12-04")).res.status).toBe(404);
    expect((await maakBoeking("constructor", "2026-12-01", "2026-12-04")).res.status).toBe(422);
  });
  it("de lijst met een periode, de vrije kamers en de bezetting", async () => {
    const { b } = await maakKamer();
    await maakKamer({ naam: "2", capaciteit: 4 });
    await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-04");
    const lijst = await lees(await kamers.GET(json("GET", "/api/werkgever/kamers?van=2026-12-04&tot=2026-12-10")));
    expect(lijst.boekingen).toEqual([]);
    expect((await lees(await kamers.GET(json("GET", "/api/werkgever/kamers?van=2026-12-03&tot=2026-12-10")))).boekingen).toHaveLength(1);
    const vrij = await lees(await kamers.GET(json("GET", "/api/werkgever/kamers?modus=vrij&aankomst=2026-12-02&vertrek=2026-12-03&personen=2")));
    expect(vrij.kamers.map((k: { naam: string }) => k.naam)).toEqual(["2"]);
    const bez = await lees(await kamers.GET(json("GET", "/api/werkgever/kamers?modus=bezetting&van=2026-12-01&tot=2026-12-04")));
    expect(bez.bezetting).toEqual({ dagen: 4, beschikbaar: 8, bezet: 3, procent: 37.5 });
  });
  it("slechte parameters geven 422", async () => {
    for (const q of ["modus=vrij&aankomst=2026-12-02&vertrek=2026-12-01&personen=2", "modus=vrij&aankomst=x&vertrek=2026-12-01", "modus=vrij&aankomst=2026-12-01&vertrek=2026-12-02&personen=99", "modus=bezetting&van=2026-12-01&tot=2027-02-01", "modus=bezetting", "modus=constructor", "van=2026-12-05&tot=2026-12-01", "van=morgen"]) {
      expect((await kamers.GET(json("GET", `/api/werkgever/kamers?${q}`))).status, q).toBe(422);
    }
  });
  it("de status: incheck, uitcheck zet de kamer op vuil, een ongeldige overgang geeft 422", async () => {
    const { b } = await maakKamer();
    const x = (await maakBoeking(b.kamer.id, "2026-11-10", "2026-11-12")).b.boeking;
    expect((await patchBoeking({ id: x.id, actie: "status", status: "uitgecheckt" })).status).toBe(422);
    expect((await patchBoeking({ id: x.id, actie: "status", status: "bestaatniet" })).status).toBe(422);
    expect((await lees(await patchBoeking({ id: x.id, actie: "status", status: "ingecheckt" }))).boeking.status).toBe("ingecheckt");
    const uit = await lees(await patchBoeking({ id: x.id, actie: "status", status: "uitgecheckt" }));
    expect(uit.boeking.status).toBe("uitgecheckt");
    expect(uit.kamer.schoon).toBe("vuil");
  });
  it("bewerken van een boeking", async () => {
    const { b } = await maakKamer();
    const x = (await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-03")).b.boeking;
    const r = await patchBoeking({ id: x.id, actie: "bewerken", kamerId: b.kamer.id, aankomst: "2026-12-01", vertrek: "2026-12-05", naam: "Pieters", personen: 1, prijsOverschrijfCent: 30_000 });
    expect((await lees(r)).boeking).toMatchObject({ naam: "Pieters", vertrek: "2026-12-05", prijsOverschrijfCent: 30_000, nummer: "K-2026-0001" });
  });
  it("gastgegevens wissen: de boeking blijft, het auditspoor krijgt geen naam", async () => {
    const { b } = await maakKamer();
    const x = (await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-03", { telefoon: "0612345678", email: "j@test.example" })).b.boeking;
    const r = await lees(await patchBoeking({ id: x.id, actie: "wis-gast" }));
    expect(r.boeking).toMatchObject({ naam: "", telefoon: "", email: "", aankomst: "2026-12-01" });
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/Jansen|0612345678|j@test/);
    expect(m.audit).toHaveBeenCalledTimes(1);
  });
  it("opschonen na de bewaartermijn", async () => {
    const { b } = await maakKamer();
    const x = (await maakBoeking(b.kamer.id, "2024-10-01", "2024-10-03")).b.boeking;
    await patchBoeking({ id: x.id, actie: "status", status: "ingecheckt" });
    await patchBoeking({ id: x.id, actie: "status", status: "uitgecheckt" });
    expect((await lees(await kamers.GET(json("GET", "/api/werkgever/kamers")))).teSchonen).toBe(1);
    expect(await lees(await patchBoeking({ actie: "opschonen" }))).toEqual({ gewist: 1 });
    expect(await lees(await patchBoeking({ actie: "opschonen" }))).toEqual({ gewist: 0 });
    expect(m.audit).toHaveBeenCalledTimes(1);
  });
  it("een andere organisatie kan een boeking niet lezen of wijzigen", async () => {
    const { b } = await maakKamer();
    const x = (await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-03")).b.boeking;
    m.tenant = "t2";
    for (const body of [{ id: x.id, actie: "status", status: "ingecheckt" }, { id: x.id, actie: "wis-gast" }, { id: x.id, actie: "bewerken", kamerId: b.kamer.id, aankomst: "2026-12-01", vertrek: "2026-12-03", naam: "X", personen: 1 }]) {
      expect((await patchBoeking(body)).status).toBe(404);
    }
    expect((await lees(await kamers.GET(json("GET", "/api/werkgever/kamers")))).boekingen).toEqual([]);
  });
  it("ongeldige boeking-id's en een onbekende actie", async () => {
    for (const id of ["constructor", "__proto__", "2026-1", "", 7, null]) expect((await patchBoeking({ id, actie: "wis-gast" })).status).toBe(404);
    const { b } = await maakKamer();
    const x = (await maakBoeking(b.kamer.id, "2026-12-01", "2026-12-03")).b.boeking;
    expect((await patchBoeking({ id: x.id, actie: "constructor" })).status).toBe(422);
  });
});
