import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
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
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"] }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.limiet(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: async () => ({ name: "Bouw BV" }) } } }));

import * as lijst from "@/app/api/werkgever/offertes/route";
import * as een from "@/app/api/werkgever/offertes/[id]/route";
import * as publiek from "@/app/api/offerte-link/[token]/route";
import { AppError } from "@/lib/errors";

const json = (method: string, p: string, body?: unknown) => new Request(`http://app:3000${p}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const id = (s: string) => ({ params: Promise.resolve({ id: s }) });
const tok = (s: string) => ({ params: Promise.resolve({ token: s }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

const BODY = { klant: { naam: "Piet Jansen", email: "piet@voorbeeld.nl", telefoon: "06 1234 5678", adres: "Dorpsstraat 1" }, titel: "Dakkapel", inleiding: "Dank!", regels: [{ omschrijving: "Arbeid", aantal: 8, eenheid: "uur", prijsCent: 6_500, btw: 21 }], kortingPct: 10, geldigTot: "2026-12-12", voorwaarden: "Betaling binnen 14 dagen." };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00+01:00"));
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.limiet.mockReset().mockResolvedValue(undefined);
  m.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

async function maak(over: Record<string, unknown> = {}): Promise<string> {
  const res = await lijst.POST(json("POST", "/api/werkgever/offertes", { ...BODY, ...over }));
  expect(res.status).toBe(200);
  return (await lees(res)).offerte.id as string;
}
async function stuur(oid: string, actie = "versturen") {
  const res = await een.POST(json("POST", `/api/werkgever/offertes/${oid}`, { actie }), id(oid));
  expect(res.status).toBe(200);
  return (await lees(res)) as { offerte: Record<string, any>; token: string };
}
async function link() {
  const oid = await maak();
  return { oid, ...(await stuur(oid)) };
}
const reageer = (token: string, body: Record<string, unknown>) => publiek.POST(json("POST", `/api/offerte-link/${token}`, body), tok(token));

describe("beheer: toegang", () => {
  it("niet ingelogd geeft 401, een lid zonder beheerdersrol 423 met een eigen code (geen 403)", async () => {
    m.ingelogd = false;
    expect((await lijst.GET()).status).toBe(401);
    m.ingelogd = true;
    m.admin = false;
    const res = await lijst.GET();
    expect(res.status).toBe(423);
    expect((await lees(res)).error.code).toBe("ALLEEN_BEHEERDER");
    expect((await lijst.POST(json("POST", "/api/werkgever/offertes", BODY))).status).toBe(423);
    expect((await een.GET(json("GET", "/x"), id("o0123456789ab"))).status).toBe(423);
    expect((await een.POST(json("POST", "/x", { actie: "versturen" }), id("o0123456789ab"))).status).toBe(423);
    expect(m.kv.size).toBe(0);
  });
});

describe("beheer: maken, lijst en bewerken", () => {
  it("maakt een concept met nummer, en de lijst laat het zien met standaard 'geldig tot'", async () => {
    const oid = await maak();
    const res = await lijst.GET();
    const b = await lees(res);
    expect(b.offertes).toHaveLength(1);
    expect(b.offertes[0]).toMatchObject({ id: oid, nummer: "OF-2026-0001", status: "concept", heeftLink: false });
    expect(b.vandaag).toBe("2026-11-12");
    expect(b.standaardGeldigTot).toBe("2026-12-12");
    expect(m.audit).toHaveBeenCalledTimes(1);
  });

  it("geeft nooit de tokenhash terug", async () => {
    const { oid } = await link();
    const b = await lees(await lijst.GET());
    expect(JSON.stringify(b)).not.toMatch(/tokenHash/);
    expect(b.offertes[0].heeftLink).toBe(true);
    expect(JSON.stringify(await lees(await een.GET(json("GET", "/x"), id(oid))))).not.toMatch(/tokenHash/);
  });

  it("ongeldige invoer geeft 422 met een Nederlandse uitleg", async () => {
    const res = await lijst.POST(json("POST", "/api/werkgever/offertes", { ...BODY, regels: [{ omschrijving: "X", aantal: 0, prijsCent: 100, btw: 21 }] }));
    expect(res.status).toBe(422);
    expect((await lees(res)).error.message).toMatch(/aantal moet groter zijn dan nul/);
    expect((await lijst.POST(new Request("http://app:3000/x", { method: "POST", body: "geen json" }))).status).toBe(422);
  });

  it("bewerken van een concept lukt; van een verstuurde offerte geeft 409 met uitleg", async () => {
    const oid = await maak();
    const ok = await een.PUT(json("PUT", `/x`, { ...BODY, titel: "Nieuw" }), id(oid));
    expect((await lees(ok)).offerte.titel).toBe("Nieuw");
    await stuur(oid);
    const nee = await een.PUT(json("PUT", `/x`, BODY), id(oid));
    expect(nee.status).toBe(409);
    expect((await lees(nee)).error.message).toMatch(/Trek hem eerst in/);
  });

  it("een geaccepteerde offerte is vergrendeld: bewerken en verwijderen geven 409, een kopie kan wel", async () => {
    const { oid, token } = await link();
    await reageer(token, { actie: "accepteer", naam: "Piet Jansen", akkoord: true });
    const put = await een.PUT(json("PUT", "/x", BODY), id(oid));
    expect(put.status).toBe(409);
    expect((await lees(put)).error.message).toMatch(/kopie/);
    expect((await een.DELETE(json("DELETE", "/x"), id(oid))).status).toBe(409);
    const k = await een.POST(json("POST", "/x", { actie: "kopie" }), id(oid));
    expect(k.status).toBe(200);
    expect((await lees(k)).offerte).toMatchObject({ status: "concept", nummer: "OF-2026-0002", kopieVan: "OF-2026-0001" });
  });

  it("verwijderen van een concept", async () => {
    const oid = await maak();
    expect((await een.DELETE(json("DELETE", "/x"), id(oid))).status).toBe(200);
    expect((await een.GET(json("GET", "/x"), id(oid))).status).toBe(404);
  });

  it("een ongeldig id, 'constructor' of een onbekende actie geeft een nette fout", async () => {
    expect((await een.GET(json("GET", "/x"), id("constructor"))).status).toBe(404);
    expect((await een.PUT(json("PUT", "/x", BODY), id("../x"))).status).toBe(404);
    const oid = await maak();
    for (const actie of ["constructor", "toString", "", "verwijder"]) expect((await een.POST(json("POST", "/x", { actie }), id(oid))).status).toBe(422);
    expect((await een.GET(json("GET", "/x"), id("o000000000000"))).status).toBe(404);
  });

  it("de beheer-API is per gebruiker begrensd", async () => {
    await maak();
    expect(m.limiet).toHaveBeenCalledWith(expect.objectContaining({ name: "offertes-maken", identifier: "u1" }));
  });
});

describe("beheer: versturen, intrekken, klantgegevens wissen", () => {
  it("versturen geeft de token één keer; daarna is de status verstuurd en bestaat alleen de hash", async () => {
    const oid = await maak();
    const r = await stuur(oid);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(r.offerte).toMatchObject({ status: "verstuurd", bedrijfsnaam: "Bouw BV", heeftLink: true });
    expect(JSON.stringify([...m.kv])).not.toContain(r.token);
    expect(JSON.stringify(await lees(await een.GET(json("GET", "/x"), id(oid))))).not.toContain(r.token);
    const dubbel = await een.POST(json("POST", "/x", { actie: "versturen" }), id(oid));
    expect(dubbel.status).toBe(409);
  });

  it("een onvolledige offerte (geen regels) versturen geeft 422", async () => {
    const oid = await maak({ regels: [] });
    const res = await een.POST(json("POST", "/x", { actie: "versturen" }), id(oid));
    expect(res.status).toBe(422);
  });

  it("intrekken maakt de link ongeldig; een nieuwe link vervangt de oude", async () => {
    const { oid, token } = await link();
    const nieuw = await stuur(oid, "nieuwe-link");
    expect((await publiek.GET(json("GET", "/x"), tok(token))).status).toBe(404);
    expect((await publiek.GET(json("GET", "/x"), tok(nieuw.token))).status).toBe(200);
    const i = await een.POST(json("POST", "/x", { actie: "intrekken" }), id(oid));
    expect((await lees(i)).offerte).toMatchObject({ status: "concept", heeftLink: false });
    expect((await publiek.GET(json("GET", "/x"), tok(nieuw.token))).status).toBe(404);
  });

  it("klantgegevens wissen: weg uit de opslag, link dood, niets persoonlijks in het auditspoor", async () => {
    const { oid, token } = await link();
    await reageer(token, { actie: "accepteer", naam: "Piet Jansen", akkoord: true });
    const res = await een.POST(json("POST", "/x", { actie: "klant-wissen" }), id(oid));
    expect((await lees(res)).offerte).toMatchObject({ klantGewist: true, klant: { naam: "Verwijderd" } });
    expect((await publiek.GET(json("GET", "/x"), tok(token))).status).toBe(404);
    expect(JSON.stringify([...m.kv])).not.toMatch(/Piet|voorbeeld|Dorpsstraat/);
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/Piet|voorbeeld|Dorpsstraat|06 1234|203\.0\.113/);
  });
});

describe("openbaar: GET /api/offerte-link/<token>", () => {
  it("toont alleen wat de klant mag zien", async () => {
    const { token } = await link();
    const res = await publiek.GET(json("GET", "/x"), tok(token));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const b = await lees(res);
    expect(Object.keys(b)).toEqual(["offerte"]);
    expect(b.offerte).toMatchObject({ bedrijfsnaam: "Bouw BV", nummer: "OF-2026-0001", titel: "Dakkapel", klantNaam: "Piet Jansen", status: "verstuurd", geldigTot: "2026-12-12", kortingBp: 1_000 });
    expect(b.offerte.regels).toHaveLength(1);
    expect(JSON.stringify(b)).not.toMatch(/tokenHash|voorbeeld|06 1234|Dorpsstraat|tenant|"id"|t1/);
  });

  it("een onbekende, foute, afgekapte of rare token geeft overal dezelfde 404", async () => {
    const { token } = await link();
    const meldingen = new Set<string>();
    for (const t of ["x".repeat(32), token.slice(0, 31), `${token}x`, "constructor", "__proto__", "", "%00".repeat(10)]) {
      const res = await publiek.GET(json("GET", "/x"), tok(t));
      expect(res.status).toBe(404);
      meldingen.add((await lees(res)).error.message);
    }
    expect(meldingen.size).toBe(1);
  });

  it("een ingetrokken link geeft dezelfde 404 als een onbekende", async () => {
    const { oid, token } = await link();
    const onbekend = await lees(await publiek.GET(json("GET", "/x"), tok("y".repeat(32))));
    await een.POST(json("POST", "/x", { actie: "intrekken" }), id(oid));
    const res = await publiek.GET(json("GET", "/x"), tok(token));
    expect(res.status).toBe(404);
    expect((await lees(res)).error.message).toBe(onbekend.error.message);
  });

  it("een verlopen offerte geeft 200 met status 'verlopen' (de pagina legt het uit)", async () => {
    const { token } = await link();
    vi.setSystemTime(new Date("2026-12-13T09:00:00+01:00"));
    const res = await publiek.GET(json("GET", "/x"), tok(token));
    expect(res.status).toBe(200);
    expect((await lees(res)).offerte.status).toBe("verlopen");
  });

  it("is per IP begrensd", async () => {
    const { token } = await link();
    m.limiet.mockReset().mockRejectedValue(AppError.rateLimited());
    const res = await publiek.GET(json("GET", "/x"), tok(token));
    expect(res.status).toBe(429);
    m.limiet.mockResolvedValue(undefined);
    await publiek.GET(json("GET", "/x"), tok(token));
    expect(m.limiet).toHaveBeenLastCalledWith(expect.objectContaining({ name: "offerte-link-lezen", identifier: "203.0.113.7" }));
  });
});

describe("openbaar: POST /api/offerte-link/<token>", () => {
  it("akkoord met naam en vinkje: de offerte is geaccepteerd en het bedrijf ziet naam en tijd", async () => {
    const { token } = await link();
    vi.setSystemTime(new Date("2026-11-14T15:30:00+01:00"));
    const res = await reageer(token, { actie: "accepteer", naam: "Piet Jansen", akkoord: true });
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.offerte).toMatchObject({ status: "geaccepteerd", beslistOp: "2026-11-14T14:30:00.000Z" });
    const lijstB = await lees(await lijst.GET());
    expect(lijstB.offertes[0]).toMatchObject({ status: "geaccepteerd", reactie: { keuze: "geaccepteerd", naam: "Piet Jansen", op: "2026-11-14T14:30:00.000Z" } });
  });

  it("zonder vinkje of zonder naam wordt niets bewaard", async () => {
    const { token } = await link();
    expect((await reageer(token, { actie: "accepteer", naam: "Piet", akkoord: false })).status).toBe(422);
    expect((await reageer(token, { actie: "accepteer", naam: "Piet" })).status).toBe(422);
    expect((await reageer(token, { actie: "accepteer", naam: "Piet", akkoord: "true" })).status).toBe(422);
    expect((await reageer(token, { actie: "accepteer", naam: "", akkoord: true })).status).toBe(422);
    expect((await reageer(token, { actie: "weet-niet", naam: "Piet", akkoord: true })).status).toBe(422);
    expect((await lees(await lijst.GET())).offertes[0].status).toBe("verstuurd");
  });

  it("afwijzen mag zonder naam en met een reden", async () => {
    const { token } = await link();
    const res = await reageer(token, { actie: "wijs-af", reden: "Te duur" });
    expect((await lees(res)).offerte.status).toBe("afgewezen");
    expect((await lees(await lijst.GET())).offertes[0].reactie).toMatchObject({ keuze: "afgewezen", reden: "Te duur" });
  });

  it("dubbel akkoord en omkeren geven 409 en veranderen niets", async () => {
    const { token } = await link();
    await reageer(token, { actie: "accepteer", naam: "Piet", akkoord: true });
    const nog = await reageer(token, { actie: "accepteer", naam: "Jan", akkoord: true });
    expect(nog.status).toBe(409);
    expect((await lees(nog)).error.message).toMatch(/al geaccepteerd/);
    expect((await reageer(token, { actie: "wijs-af" })).status).toBe(409);
    expect((await lees(await lijst.GET())).offertes[0].reactie.naam).toBe("Piet");
  });

  it("op een verlopen offerte kan niet meer geaccepteerd worden", async () => {
    const { token } = await link();
    vi.setSystemTime(new Date("2026-12-13T09:00:00+01:00"));
    const res = await reageer(token, { actie: "accepteer", naam: "Piet", akkoord: true });
    expect(res.status).toBe(409);
    expect((await lees(res)).error.message).toMatch(/verlopen/);
  });

  it("een foute of ingetrokken token geeft 404 en bewaart niets", async () => {
    const { oid, token } = await link();
    expect((await reageer("x".repeat(32), { actie: "accepteer", naam: "Piet", akkoord: true })).status).toBe(404);
    await een.POST(json("POST", "/x", { actie: "intrekken" }), id(oid));
    expect((await reageer(token, { actie: "accepteer", naam: "Piet", akkoord: true })).status).toBe(404);
    expect((await lees(await lijst.GET())).offertes[0]).toMatchObject({ status: "concept" });
  });

  it("het verborgen botveld: doet alsof het lukt, maar bewaart niets", async () => {
    const { token } = await link();
    const res = await reageer(token, { actie: "accepteer", naam: "Bot", akkoord: true, website: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(await lees(res)).toEqual({ ok: true });
    expect((await lees(await lijst.GET())).offertes[0].status).toBe("verstuurd");
  });

  it("is strenger per IP begrensd dan lezen, en bewaart het IP niet", async () => {
    const { token } = await link();
    await reageer(token, { actie: "accepteer", naam: "Piet", akkoord: true });
    expect(m.limiet).toHaveBeenLastCalledWith(expect.objectContaining({ name: "offerte-link-reageren", identifier: "203.0.113.7", limit: 12 }));
    expect(JSON.stringify([...m.kv])).not.toContain("203.0.113.7");
    m.limiet.mockReset().mockRejectedValue(AppError.rateLimited("Te vaak."));
    const res = await reageer(token, { actie: "wijs-af" });
    expect(res.status).toBe(429);
  });
});
