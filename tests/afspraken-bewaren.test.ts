import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  gate: { ok: true } as { ok: boolean; status?: number; message?: string },
  cron: vi.fn(),
  leden: [] as { userId: string; tenantId: string; role: string; actief: boolean }[],
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvFindDue: async (p: string, veld: string, grens: string, na = "", limit = 500) =>
    [...m.kv]
      .filter(([k, v]) => k.startsWith(p) && k > na && String((v as Record<string, unknown>)[veld]) <= grens)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, limit)
      .map(([key, v]) => ({ key, value: structuredClone(v) })),
  kvDeleteStale: async (p: string) => {
    let n = 0;
    for (const k of [...m.kv.keys()]) if (k.startsWith(p)) (m.kv.delete(k), (n += 1));
    return n;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: async ({ where }: { where: { userId: string; role: string } }) => m.leden.filter((l) => l.userId === where.userId && l.role === where.role).map((l) => ({ tenantId: l.tenantId })),
      count: async ({ where }: { where: { tenantId: string; userId: { not: string } } }) => m.leden.filter((l) => l.tenantId === where.tenantId && l.userId !== where.userId.not && l.actief).length,
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: () => m.gate }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: (...a: unknown[]) => m.cron(...a) }));

import * as cron from "@/app/api/internal/afspraken/bewaartermijn/route";
import { BEWAARTERMIJN_DAGEN, beginInstellingen, bewaarGrens, heeftPersoon, zonderPersoon, type Afspraak } from "@/lib/afspraken/model";
import { wisVerlatenOrganisaties, wisVerlopenAfspraken } from "@/lib/afspraken/bewaren";
import { bewaarInstellingen, bewaarNotitie, nieuwId } from "@/lib/afspraken/store";

const NU = new Date("2026-11-12T06:00:00Z");
const dagenTerug = (n: number) => new Date(NU.getTime() - n * 86_400_000).toISOString();

/** Zet een afspraak met persoonsgegevens in de opslag, `dagen` dagen vóór NU. */
const zet = (tenant: string, dagen: number, naam = "Piet Jansen", id = nieuwId()) => {
  const start = dagenTerug(dagen);
  const sleutelId = `${start.slice(0, 10)}~${id}${id}`.slice(0, 22);
  const a: Afspraak = {
    id: sleutelId,
    dienstId: "d1",
    dienstNaam: "Knippen",
    duurMin: 30,
    prijsCent: 2500,
    medewerkerId: "w1",
    medewerkerNaam: "Jan",
    start,
    eind: start,
    klant: { naam, telefoon: "06 1234 5678", email: "piet@voorbeeld.test" },
    opmerking: "Graag een korte baard",
    status: "geweest",
    bron: "online",
    gemaaktOp: start,
  };
  m.kv.set(`afspraken:item:${tenant}:${a.id}`, a);
  return `afspraken:item:${tenant}:${a.id}`;
};
const lees = (k: string) => m.kv.get(k) as Afspraak;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  m.kv.clear();
  m.gate = { ok: true };
  m.cron.mockReset();
  m.leden = [];
});
afterEach(() => vi.useRealTimers());

describe("bewaartermijn: de regels", () => {
  it("is twee jaar, en de grens ligt 730 dagen voor nu", () => {
    expect(BEWAARTERMIJN_DAGEN).toBe(730);
    expect(bewaarGrens(NU).toISOString()).toBe(dagenTerug(730));
  });

  it("zonderPersoon houdt dienst, tijd en status en wist de rest; heeftPersoon ziet het verschil", () => {
    const k = lees(zet("tenant1", 800));
    expect(heeftPersoon(k)).toBe(true);
    const leeg = zonderPersoon(k);
    expect(leeg).toMatchObject({ dienstNaam: "Knippen", status: "geweest", start: k.start, prijsCent: 2500, klant: { naam: "Verwijderd", telefoon: "", email: "" }, opmerking: "" });
    expect(heeftPersoon(leeg)).toBe(false);
  });
});

describe("wisVerlopenAfspraken", () => {
  it("wist de persoonsgegevens van afspraken ouder dan 2 jaar, en laat jongere met rust", async () => {
    const oud = zet("tenant1", 731);
    const net = zet("tenant1", 729);
    const jong = zet("tenant1", 30);
    const uit = await wisVerlopenAfspraken({ now: NU });
    expect(uit).toEqual({ gewist: 1, afgekapt: false });
    expect(lees(oud).klant).toEqual({ naam: "Verwijderd", telefoon: "", email: "" });
    expect(lees(oud).opmerking).toBe("");
    expect(lees(oud)).toMatchObject({ status: "geweest", dienstNaam: "Knippen" }); // de afspraak blijft als lege regel
    expect(lees(net).klant.naam).toBe("Piet Jansen");
    expect(lees(jong).klant.naam).toBe("Piet Jansen");
    expect(JSON.stringify(lees(oud))).not.toMatch(/Piet|voorbeeld|1234|korte baard/);
  });

  it("werkt over alle organisaties heen, en laat de klantnotities en instellingen met rust", async () => {
    const a = zet("tenant1", 900);
    const b = zet("tenant2", 900, "Els");
    await bewaarInstellingen("tenant1", { ...beginInstellingen("Kapper Jan", nieuwId), actief: true });
    await bewaarNotitie("tenant1", "e-piet@voorbeeld.test", "Vertrouwelijk");
    expect((await wisVerlopenAfspraken({ now: NU })).gewist).toBe(2);
    expect(lees(a).klant.naam).toBe("Verwijderd");
    expect(lees(b).klant.naam).toBe("Verwijderd");
    expect(m.kv.has("afspraken:klant:tenant1:e-piet@voorbeeld.test")).toBe(true);
    expect(m.kv.has("afspraken:inst:tenant1")).toBe(true);
  });

  it("is idempotent: een tweede ronde vindt niets meer en schrijft niets", async () => {
    zet("tenant1", 900);
    await wisVerlopenAfspraken({ now: NU });
    const voor = JSON.stringify([...m.kv]);
    expect(await wisVerlopenAfspraken({ now: NU })).toEqual({ gewist: 0, afgekapt: false });
    expect(JSON.stringify([...m.kv])).toBe(voor);
  });

  it("dryRun telt alleen: er wordt niets gewist", async () => {
    const oud = zet("tenant1", 900);
    expect(await wisVerlopenAfspraken({ now: NU, dryRun: true })).toEqual({ gewist: 1, afgekapt: false });
    expect(lees(oud).klant.naam).toBe("Piet Jansen");
  });

  it("gaat door over meer dan één pagina (500) en slaat al gewiste regels over", async () => {
    const sleutels: string[] = [];
    for (let x = 0; x < 1_200; x += 1) sleutels.push(zet("tenant1", 800 + (x % 50), "Piet", `x${x}`.padStart(5, "0")));
    // een deel is al gewist: die tellen niet mee
    for (const k of sleutels.slice(0, 100)) m.kv.set(k, zonderPersoon(lees(k)));
    const uit = await wisVerlopenAfspraken({ now: NU });
    expect(uit.gewist).toBe(1_100);
    expect(sleutels.every((k) => !heeftPersoon(lees(k)))).toBe(true);
  });

  it("de klok telt: een afspraak die nu 729 dagen oud is, is over twee dagen verlopen", async () => {
    const k = zet("tenant1", 729);
    await wisVerlopenAfspraken({ now: NU });
    expect(heeftPersoon(lees(k))).toBe(true);
    await wisVerlopenAfspraken({ now: new Date(NU.getTime() + 2 * 86_400_000) });
    expect(heeftPersoon(lees(k))).toBe(false);
  });
});

describe("cron-route /api/internal/afspraken/bewaartermijn", () => {
  const vraag = (q = "") => new Request(`http://app:3000/api/internal/afspraken/bewaartermijn${q}`, { method: "POST" });

  it("zonder geldig token 401 en er wordt niets gewist", async () => {
    m.gate = { ok: false, status: 401, message: "Geen toegang." };
    const k = zet("tenant1", 900);
    const res = await cron.POST(vraag());
    expect(res.status).toBe(401);
    expect(lees(k).klant.naam).toBe("Piet Jansen");
    expect(m.cron).not.toHaveBeenCalled();
  });

  it("met token wist hij en meldt hij de run (de hartslag in Admin → Systeem)", async () => {
    const k = zet("tenant1", 900);
    const res = await cron.POST(vraag());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dryRun: false, gewist: 1, afgekapt: false });
    expect(lees(k).klant.naam).toBe("Verwijderd");
    expect(m.cron).toHaveBeenCalledWith("afspraken-bewaartermijn", true);
  });

  it("?dryRun=1 telt alleen, ook via GET", async () => {
    const k = zet("tenant1", 900);
    const res = await cron.GET(vraag("?dryRun=1"));
    expect(await res.json()).toMatchObject({ dryRun: true, gewist: 1 });
    expect(lees(k).klant.naam).toBe("Piet Jansen");
  });
});

describe("een organisatie die verdwijnt: wisVerlatenOrganisaties", () => {
  const lid = (userId: string, tenantId: string, role = "HQ_ADMIN", actief = true) => ({ userId, tenantId, role, actief });

  it("wist alles van een organisatie waarvan dit de laatste actieve beheerder was", async () => {
    await bewaarInstellingen("tenant1", { ...beginInstellingen("Kapper Jan", nieuwId), actief: true });
    const k = zet("tenant1", 10);
    await bewaarNotitie("tenant1", "e-piet@voorbeeld.test", "Vertrouwelijk");
    m.leden = [lid("u1", "tenant1")];
    expect(await wisVerlatenOrganisaties("u1")).toEqual(["tenant1"]);
    expect(m.kv.has(k)).toBe(false);
    expect([...m.kv.keys()].filter((x) => x.startsWith("afspraken:"))).toEqual([]);
  });

  it("laat een organisatie staan als er nog een ander actief lid is, of als het geen beheerder was", async () => {
    const k1 = zet("tenant1", 10);
    const k2 = zet("tenant2", 10);
    const k3 = zet("tenant3", 10);
    m.leden = [lid("u1", "tenant1"), lid("u2", "tenant1", "LOCAL_MANAGER"), lid("u1", "tenant2"), lid("u3", "tenant2", "HQ_ADMIN", false), lid("u1", "tenant3", "LOCAL_MANAGER")];
    // tenant1: er is nog een actief lid; tenant2: de enige andere beheerder is al uitgeschakeld (telt niet); tenant3: u1 was geen beheerder
    expect(await wisVerlatenOrganisaties("u1")).toEqual(["tenant2"]);
    expect(m.kv.has(k1)).toBe(true);
    expect(m.kv.has(k2)).toBe(false);
    expect(m.kv.has(k3)).toBe(true);
  });

  it("een gebruiker zonder organisaties raakt niets", async () => {
    const k = zet("tenant1", 10);
    expect(await wisVerlatenOrganisaties("u9")).toEqual([]);
    expect(m.kv.has(k)).toBe(true);
  });
});
