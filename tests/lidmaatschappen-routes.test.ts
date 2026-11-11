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

import * as route from "@/app/api/werkgever/lidmaatschappen/route";

const PAD = "/api/werkgever/lidmaatschappen";
const json = (method: string, p: string, body?: unknown) => new Request(`http://app:3000${p}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;
const post = async (body: unknown) => {
  const res = await route.POST(json("POST", PAD, body));
  return { res, b: await lees(res) };
};
const patch = async (body: unknown) => {
  const res = await route.PATCH(json("PATCH", PAD, body));
  return { res, b: await lees(res) };
};

const sanne = { type: "lid", naam: "Sanne de Vries", telefoon: "06 12345678", email: "sanne@example.test", notitie: "Knie sparen" };

/** Een vorm, een lid en een lidmaatschap via de routes. */
async function opzet(vorm: Record<string, unknown> = { type: "vorm", naam: "Maand", soort: "maand", prijsCent: 3000 }) {
  const v = (await post(vorm)).b.vorm;
  const l = (await post(sanne)).b.lid;
  const lm = (await post({ type: "lidmaatschap", lidId: l.id, vormId: v.id })).b.lidmaatschap;
  return { v, l, lm };
}

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
    expect((await route.GET(json("GET", PAD))).status).toBe(401);
  });
  it("een lid zonder beheerdersrol krijgt 423 met een eigen code, geen 403", async () => {
    m.admin = false;
    for (const res of [await route.GET(json("GET", PAD)), await route.POST(json("POST", PAD, {})), await route.PATCH(json("PATCH", PAD, {}))]) {
      expect(res.status).toBe(423);
      expect((await lees(res)).error.code).toBe("ALLEEN_BEHEERDER");
    }
  });
  it("zonder organisatie: niet gevonden", async () => {
    m.tenant = undefined;
    expect((await route.GET(json("GET", PAD))).status).toBe(404);
  });
});

describe("aanmaken en lezen", () => {
  it("GET geeft vandaag, vormen, leden en lidmaatschappen zonder cache", async () => {
    await opzet();
    const res = await route.GET(json("GET", PAD));
    expect(res.headers.get("cache-control")).toBe("no-store");
    const b = await lees(res);
    expect(b.vandaag).toBe("2026-11-12");
    expect(b.vormen).toHaveLength(1);
    expect(b.leden).toHaveLength(1);
    expect(b.lidmaatschappen).toHaveLength(1);
    expect(b.leden[0].nummer).toBe("L-0001");
    expect(JSON.stringify(b)).not.toMatch(/geboorte/);
  });
  it("een ongeldige invoer geeft 422 met een Nederlandse tekst", async () => {
    expect((await post({ type: "vorm", naam: "a", soort: "maand", prijsCent: 1 })).b.error.message).toMatch(/naam/);
    const slecht = await post({ type: "lid", naam: "Sanne" });
    expect(slecht.res.status).toBe(422);
    expect(slecht.b.error.message).toMatch(/telefoonnummer of een e-mailadres/);
    expect((await post({ type: "iets" })).res.status).toBe(422);
    expect((await post({})).res.status).toBe(422);
  });
  it("een kapotte body geeft een gewone fout, geen 500", async () => {
    const res = await route.POST(new Request(`http://app:3000${PAD}`, { method: "POST", body: "{kapot" }));
    expect(res.status).toBe(422);
  });
  it("een andere organisatie ziet niets en kan niets raken", async () => {
    const { l, lm, v } = await opzet();
    m.tenant = "t2";
    const b = await lees(await route.GET(json("GET", PAD)));
    expect([b.vormen, b.leden, b.lidmaatschappen]).toEqual([[], [], []]);
    expect((await patch({ type: "lid", id: l.id, actie: "wissen" })).res.status).toBe(404);
    expect((await patch({ type: "lidmaatschap", id: lm.id, actie: "pauzeren" })).res.status).toBe(404);
    expect((await patch({ type: "vorm", id: v.id, actie: "archiveren" })).res.status).toBe(404);
    expect((await post({ type: "bezoek", lidId: l.id })).res.status).toBe(404);
    expect((await route.GET(json("GET", `${PAD}?lid=${l.id}`))).status).toBe(200);
    expect((await lees(await route.GET(json("GET", `${PAD}?lid=${l.id}`)))).bezoeken).toEqual([]);
  });
});

describe("ongeldige id's", () => {
  it("geven 404, ook 'constructor' en padtrucs", async () => {
    for (const id of ["constructor", "__proto__", "../x", "", "ZZZZZZZZZZZZ", 5, null, undefined]) {
      expect((await patch({ type: "lid", id, actie: "wissen" })).res.status).toBe(404);
      expect((await patch({ type: "lidmaatschap", id, actie: "pauzeren" })).res.status).toBe(404);
      expect((await patch({ type: "vorm", id, actie: "archiveren" })).res.status).toBe(404);
      expect((await post({ type: "bezoek", lidId: id })).res.status).toBe(404);
    }
    expect((await route.GET(json("GET", `${PAD}?lid=constructor`))).status).toBe(404);
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("een onbekende actie of soort geeft 422", async () => {
    const { l, lm, v } = await opzet();
    expect((await patch({ type: "lid", id: l.id, actie: "weg" })).res.status).toBe(422);
    expect((await patch({ type: "lidmaatschap", id: lm.id, actie: "weg" })).res.status).toBe(422);
    expect((await patch({ type: "vorm", id: v.id, actie: "weg" })).res.status).toBe(422);
    expect((await patch({ type: "iets", id: l.id, actie: "wissen" })).res.status).toBe(422);
  });
});

describe("bezoeken", () => {
  it("een bezoek op een strippenkaart geeft het bijgewerkte lidmaatschap terug en komt in het logboek", async () => {
    const { l, lm } = await opzet({ type: "vorm", naam: "Tien", soort: "strippenkaart", strippen: 10, geldigheidMaanden: 6 });
    const r = await post({ type: "bezoek", lidId: l.id });
    expect(r.res.status).toBe(201);
    expect(r.b.lidmaatschap).toMatchObject({ id: lm.id, strippenGebruikt: 1 });
    expect(r.b.bezoek).toMatchObject({ strip: true, dag: "2026-11-12", door: "u1" });
    expect(r.b.lid.laatstGezien).toBe("2026-11-12T06:00:00.000Z");
    const log = await lees(await route.GET(json("GET", `${PAD}?lid=${l.id}`)));
    expect(log.bezoeken).toHaveLength(1);
  });
  it("een bezoek zonder tegoed geeft 409 met een Nederlandse uitleg", async () => {
    const { l } = await opzet({ type: "vorm", naam: "Een", soort: "strippenkaart", strippen: 1, geldigheidMaanden: 6 });
    expect((await post({ type: "bezoek", lidId: l.id })).res.status).toBe(201);
    const r = await post({ type: "bezoek", lidId: l.id });
    expect(r.res.status).toBe(409);
    expect(r.b.error.message).toMatch(/is op/);
  });
});

describe("lid wissen", () => {
  it("wist de gegevens, laat de rest staan en zet geen persoonsgegevens in het auditspoor", async () => {
    const { l } = await opzet();
    await post({ type: "bezoek", lidId: l.id });
    const r = await patch({ type: "lid", id: l.id, actie: "wissen" });
    expect(r.res.status).toBe(200);
    expect(r.b.lid).toMatchObject({ gewist: true, naam: "", telefoon: "", email: "", notitie: "" });
    const alles = JSON.stringify([...m.kv]);
    for (const spoor of ["Sanne", "06 12345678", "sanne@example.test", "Knie sparen"]) expect(alles).not.toContain(spoor);
    const lijst = await lees(await route.GET(json("GET", PAD)));
    expect(lijst.lidmaatschappen).toHaveLength(1);
    expect(m.audit).toHaveBeenCalledTimes(1);
    const regel = JSON.stringify(m.audit.mock.calls[0]);
    expect(regel).toContain("lidmaatschappen.lid_gewist");
    for (const spoor of ["Sanne", "sanne@", "06 12"]) expect(regel).not.toContain(spoor);
  });
});

describe("PATCH", () => {
  it("lid bewerken, vorm bewerken en archiveren, lidmaatschap pauzeren, hervatten en beëindigen", async () => {
    const { l, lm, v } = await opzet();
    expect((await patch({ type: "lid", id: l.id, actie: "bewerken", naam: "Sanne Jansen", email: "s@example.test" })).b.lid).toMatchObject({ naam: "Sanne Jansen", telefoon: "" });
    expect((await patch({ type: "vorm", id: v.id, actie: "bewerken", naam: "Maand plus", soort: "maand", prijsCent: 3500 })).b.vorm).toMatchObject({ naam: "Maand plus", prijsCent: 3500 });
    expect((await patch({ type: "vorm", id: v.id, actie: "archiveren" })).b.vorm.gearchiveerd).toBe(true);
    expect((await patch({ type: "vorm", id: v.id, actie: "terughalen" })).b.vorm.gearchiveerd).toBe(false);
    expect((await patch({ type: "lidmaatschap", id: lm.id, actie: "pauzeren" })).b.lidmaatschap).toMatchObject({ status: "gepauzeerd", pauzeSinds: "2026-11-12" });
    expect((await patch({ type: "lidmaatschap", id: lm.id, actie: "hervatten" })).b.lidmaatschap.status).toBe("actief");
    const eind = await patch({ type: "lidmaatschap", id: lm.id, actie: "beeindigen" });
    expect(eind.res.status).toBe(422);
    expect(eind.b.error.message).toMatch(/reden/);
    expect((await patch({ type: "lidmaatschap", id: lm.id, actie: "beeindigen", reden: "Verhuisd" })).b.lidmaatschap).toMatchObject({ status: "beeindigd", eindReden: "Verhuisd", einddatum: "2026-11-12" });
    expect((await patch({ type: "lidmaatschap", id: lm.id, actie: "pauzeren" })).res.status).toBe(409);
  });
});
