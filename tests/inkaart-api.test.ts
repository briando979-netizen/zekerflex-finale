import { beforeEach, describe, expect, it, vi } from "vitest";

// De opslag en de route van "Bedrijf in kaart": het bedrijf komt uit de sessie, lezen mag elke rol, bewaren alleen een beheerder of lokale manager,
// en wat niet klopt wordt geweigerd (422) in plaats van half bewaard.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  rollen: ["HQ_ADMIN"] as string[],
  tenant: "t-1" as string | null,
  limietFout: false,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/auth", () => ({ hasRole: (_p: unknown, ...rollen: string[]) => rollen.some((r) => h.rollen.includes(r)) }));
vi.mock("@/lib/webhooks/employer", () => ({
  employerTenant: async () => {
    const { AppError } = await import("@/lib/errors");
    if (!h.tenant) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
    return { principal: { userId: "u-1" }, tenantId: h.tenant };
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: async () => {
    if (h.limietFout) {
      const { AppError } = await import("@/lib/errors");
      throw AppError.rateLimited("te vaak", 60);
    }
  },
}));

import { GET, PUT } from "@/app/api/werkgever/in-kaart/route";
import { leegBedrijf, legeBezetting, type BedrijfInKaart } from "@/lib/inkaart/model";
import { INKAART_PREFIX, bewaarInKaart, leesInKaart } from "@/lib/inkaart/store";

const NU = new Date("2026-11-15T10:00:00+01:00");
const bedrijf = (): BedrijfInKaart => ({
  ...leegBedrijf("praktijk", NU),
  omzetJaar: 900_000,
  groepen: [{ id: "g1", naam: "Behandelaars", fte: 4, kostenJaar: 360_000 }],
  ruimtes: [{ id: "r1", naam: "Spreekkamer", soort: "Spreekkamer", aantal: 3, m2: 14, plekken: 2, afdeling: "Praktijk", verdieping: "0", bezetting: legeBezetting(), notitie: "" }],
});
const put = (body: unknown) => PUT(new Request("http://app:3000/api/werkgever/in-kaart", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  h.kv.clear();
  h.rollen = ["HQ_ADMIN"];
  h.tenant = "t-1";
  h.limietFout = false;
});

describe("de opslag", () => {
  it("bewaart per organisatie met het tijdstip van nu en leest hem terug", async () => {
    expect(await leesInKaart("t-1")).toBeNull();
    const bewaard = await bewaarInKaart("t-1", bedrijf(), new Date("2026-11-15T12:00:00Z"));
    expect(bewaard.bijgewerkt).toBe("2026-11-15T12:00:00.000Z");
    expect((await leesInKaart("t-1"))?.omzetJaar).toBe(900_000);
    expect(h.kv.has(`${INKAART_PREFIX}t-1`)).toBe(true);
  });

  it("een andere organisatie ziet het nooit", async () => {
    await bewaarInKaart("t-1", bedrijf());
    expect(await leesInKaart("t-2")).toBeNull();
  });

  it("een bewaard document dat niet meer klopt telt als niets (en breekt niets)", async () => {
    h.kv.set(`${INKAART_PREFIX}t-1`, { versie: 1, kapot: true });
    expect(await leesInKaart("t-1")).toBeNull();
  });
});

describe("GET en PUT", () => {
  it("GET geeft null zolang er niets is bewaard, daarna het bedrijf", async () => {
    expect((await (await GET()).json()).bedrijf).toBeNull();
    expect((await put(bedrijf())).status).toBe(200);
    const na = await (await GET()).json();
    expect(na.bedrijf.groepen[0].naam).toBe("Behandelaars");
  });

  it("PUT geeft de bewaarde versie terug, met het tijdstip van de server (niet dat van de aanvraag)", async () => {
    const res = await put({ ...bedrijf(), bijgewerkt: "1999-01-01T00:00:00Z" });
    const { bedrijf: b } = await res.json();
    expect(b.bijgewerkt).not.toBe("1999-01-01T00:00:00Z");
    expect(Date.parse(b.bijgewerkt)).toBeGreaterThan(Date.parse("2026-11-01T00:00:00Z"));
  });

  it("de organisatie komt uit de sessie: wat de aanvraag over een andere organisatie zegt telt niet", async () => {
    await put({ ...bedrijf(), tenantId: "t-2" });
    expect(h.kv.has(`${INKAART_PREFIX}t-1`)).toBe(true);
    expect(h.kv.has(`${INKAART_PREFIX}t-2`)).toBe(false);
  });

  it("een lokale manager mag bewaren, een geschillenbeheerder alleen lezen (423 met een eigen code, geen 403)", async () => {
    h.rollen = ["LOCAL_MANAGER"];
    expect((await put(bedrijf())).status).toBe(200);
    h.rollen = ["DISPUTE_MANAGER"];
    const res = await put(bedrijf());
    expect(res.status).toBe(423);
    expect((await res.json()).error.code).toBe("ALLEEN_BEHEERDER");
    expect((await GET()).status).toBe(200);
  });

  it("weigert gegevens die niet kloppen met 422, en bewaart dan niets", async () => {
    for (const slecht of [{}, null, { ...bedrijf(), omzetJaar: -1 }, { ...bedrijf(), open: [true] }, { ...bedrijf(), soort: "dierentuin" }]) {
      const res = await put(slecht);
      expect(res.status, JSON.stringify(slecht)?.slice(0, 40)).toBe(422);
    }
    expect(h.kv.size).toBe(0);
  });

  it("zonder organisatie geeft het een nette fout, en een te vaak bewaren de limiet", async () => {
    h.tenant = null;
    expect((await GET()).status).toBeGreaterThanOrEqual(400);
    h.tenant = "t-1";
    h.limietFout = true;
    expect((await put(bedrijf())).status).toBe(429);
  });
});
