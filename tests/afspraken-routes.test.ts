import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
  limiet: vi.fn(),
  audit: vi.fn(),
  melding: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
  kvFindDue: async (p: string, veld: string, grens: string, na = "", limit = 500) =>
    [...m.kv]
      .filter(([k, v]) => k.startsWith(p) && k > na && String((v as Record<string, unknown>)[veld]) <= grens)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, limit)
      .map(([key, v]) => ({ key, value: structuredClone(v) })),
  kvDeleteStale: async () => 0,
}));
// de melding aan het bedrijf (push/mail) heeft eigen tests; hier alleen: wordt hij aangeroepen, en breekt hij het boeken niet
vi.mock("@/lib/afspraken/melding", () => ({ meldBedrijf: (...a: unknown[]) => m.melding(...a) }));
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
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: async () => ({ name: "Kapper Jan" }) } } }));

import * as beheer from "@/app/api/werkgever/afspraken/route";
import * as status from "@/app/api/werkgever/afspraken/[id]/route";
import * as klanten from "@/app/api/werkgever/klanten/route";
import * as publiek from "@/app/api/boeken/[slug]/route";
import { beginInstellingen, klantSleutel } from "@/lib/afspraken/model";
import { bewaarInstellingen, nieuwId } from "@/lib/afspraken/store";

const url = (p: string) => `http://app:3000${p}`;
const json = (method: string, p: string, body?: unknown) => new Request(url(p), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const slug = (s = "kapper-jan") => ({ params: Promise.resolve({ slug: s }) });
const id = (s: string) => ({ params: Promise.resolve({ id: s }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

let i = { ...beginInstellingen("Kapper Jan", nieuwId), actief: true };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z")); // donderdag 07:00 in Nederland
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.limiet.mockReset().mockResolvedValue(undefined);
  m.audit.mockReset().mockResolvedValue(undefined);
  m.melding.mockReset().mockResolvedValue(undefined);
  i ={ ...beginInstellingen("Kapper Jan", nieuwId), actief: true };
  await bewaarInstellingen("t1", i);
});
afterEach(() => vi.useRealTimers());

const klantBody = { naam: "Piet Jansen", telefoon: "06 1234 5678", email: "piet@voorbeeld.nl" };
const boekBody = (over: Record<string, unknown> = {}) => ({ dienstId: i.diensten[0]!.id, medewerkerId: i.medewerkers[0]!.id, start: "2026-11-12T08:00:00.000Z", klant: klantBody, toestemming: true, opmerking: "", website: "", ...over });

describe("openbare boekpagina: GET /api/boeken/<slug>", () => {
  it("geeft alleen wat een klant nodig heeft: naam, diensten en medewerkers, niets van het bedrijf zelf", async () => {
    const res = await publiek.GET(json("GET", "/api/boeken/kapper-jan"), slug());
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.bedrijfsnaam).toBe("Kapper Jan");
    expect(b.diensten[0]).toEqual({ id: i.diensten[0]!.id, naam: "Afspraak", duurMin: 30, prijsCent: null });
    expect(b.medewerkers).toHaveLength(1);
    expect(b.vanDag).toBe("2026-11-12");
    expect(Object.keys(b).sort()).toEqual(["bedrijfsnaam", "diensten", "medewerkers", "openDagen", "totDag", "vanDag"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("openDagen zijn de weekdagen (0 = zondag) met minstens één tijdvak; gesloten dagen staan er niet in", async () => {
    // beginopzet: ma t/m vr open, za en zo dicht
    const b = await lees(await publiek.GET(json("GET", "/api/boeken/kapper-jan"), slug()));
    expect(b.openDagen).toEqual(i.uren.map((v, d) => (v.length > 0 ? d : -1)).filter((d) => d >= 0));
    expect(b.openDagen).not.toContain(0);
    const alleenDinsdag = i.uren.map((_, d) => (d === 2 ? [{ van: "09:00", tot: "12:00" }] : []));
    await bewaarInstellingen("t1", { ...i, uren: alleenDinsdag });
    expect((await lees(await publiek.GET(json("GET", "/api/boeken/kapper-jan"), slug()))).openDagen).toEqual([2]);
  });

  it("een boekadres dat niet bestaat of dicht staat geeft 404, met dezelfde tekst", async () => {
    const onbekend = await publiek.GET(json("GET", "/api/boeken/bestaat-niet"), slug("bestaat-niet"));
    await bewaarInstellingen("t1", { ...i, actief: false });
    const dicht = await publiek.GET(json("GET", "/api/boeken/kapper-jan"), slug());
    expect(onbekend.status).toBe(404);
    expect(dicht.status).toBe(404);
    expect((await lees(onbekend)).error.message).toBe((await lees(dicht)).error.message);
  });

  it("de vrije tijden van een dag, zonder te zeggen wie erbij hoort", async () => {
    const res = await publiek.GET(json("GET", `/api/boeken/kapper-jan?dienst=${i.diensten[0]!.id}&dag=2026-11-12`), slug());
    const b = await lees(res);
    expect(b.tijden).toHaveLength(16);
    expect(b.tijden[0]).toBe("2026-11-12T08:00:00.000Z");
    expect(b.tijden.every((t: unknown) => typeof t === "string")).toBe(true);
  });

  it("een halve vraag of een onzindag is een gewone fout", async () => {
    const een = await publiek.GET(json("GET", "/api/boeken/kapper-jan?dienst=x"), slug());
    const twee = await publiek.GET(json("GET", `/api/boeken/kapper-jan?dienst=${i.diensten[0]!.id}&dag=morgen`), slug());
    expect(een.status).toBe(422);
    expect(twee.status).toBe(422);
  });
});

describe("openbare boekpagina: POST /api/boeken/<slug>", () => {
  it("boekt, en geeft alleen de tijd en de namen terug (geen id, geen gegevens van anderen)", async () => {
    const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.afspraak).toMatchObject({ bevestigd: true, bedrijfsnaam: "Kapper Jan", dienstNaam: "Afspraak", start: "2026-11-12T08:00:00.000Z", eind: "2026-11-12T08:30:00.000Z" });
    expect(JSON.stringify(b)).not.toMatch(/Piet|voorbeeld\.nl|0612|2026-11-12~/);
    // het bedrijf krijgt een melding, met de afspraak (de melding zelf is getest in afspraken-melding.test.ts)
    expect(m.melding).toHaveBeenCalledTimes(1);
    expect(m.melding).toHaveBeenCalledWith("t1", expect.objectContaining({ dienstNaam: "Afspraak", start: "2026-11-12T08:00:00.000Z", bron: "online" }), "geboekt");
    // en het staat nu in het beheer
    const lijst = await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2026-11-12")));
    expect(lijst.afspraken).toHaveLength(1);
    expect(lijst.afspraken[0].klant.naam).toBe("Piet Jansen");
  });

  it("een melding die faalt (of nooit klaar komt) laat het boeken niet falen of wachten", async () => {
    m.melding.mockRejectedValueOnce(new Error("push stuk"));
    const stuk = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    expect(stuk.status).toBe(200);
    m.melding.mockReturnValueOnce(new Promise(() => undefined)); // blijft hangen
    const hangt = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ start: "2026-11-12T09:00:00.000Z", klant: { naam: "Els Klant", telefoon: "", email: "els@voorbeeld.nl" } })), slug());
    expect(hangt.status).toBe(200);
    expect(m.melding).toHaveBeenCalledTimes(2);
  });

  it("geen melding als er niets geboekt is (bot, fout of net bezet)", async () => {
    await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ website: "https://spam.example" })), slug());
    await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ toestemming: false })), slug());
    await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    m.melding.mockClear();
    const dubbel = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ klant: { naam: "Els", telefoon: "", email: "els@voorbeeld.nl" } })), slug());
    expect(dubbel.status).toBe(409);
    expect(m.melding).not.toHaveBeenCalled();
  });

  it("dezelfde tijd twee keer: de tweede krijgt 409 met een gewone zin", async () => {
    await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ klant: { naam: "Els", telefoon: "", email: "els@voorbeeld.nl" } })), slug());
    expect(res.status).toBe(409);
    expect((await lees(res)).error.message).toMatch(/Kies een andere tijd/);
  });

  it("zonder toestemming, met een foute klant of een tijd zonder zone wordt niets bewaard", async () => {
    const fouten = [
      boekBody({ toestemming: false }),
      boekBody({ klant: { naam: "P", telefoon: "", email: "" } }),
      boekBody({ klant: { naam: "Piet", telefoon: "", email: "" } }),
      boekBody({ start: "2026-11-12T09:00:00" }), // geen Z: een klokkentijd zonder zone wordt nooit geraden
      boekBody({ start: "geen tijd" }),
    ];
    for (const b of fouten) expect((await publiek.POST(json("POST", "/api/boeken/kapper-jan", b), slug())).status, JSON.stringify(b)).toBe(422);
    expect((await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2026-11-12")))).afspraken).toHaveLength(0);
  });

  it("een ingevuld verborgen veld (bot) lijkt te lukken maar bewaart niets", async () => {
    const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ website: "https://spam.example" })), slug());
    expect(res.status).toBe(200);
    expect((await lees(res)).afspraak).toEqual({ bevestigd: true });
    expect((await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2026-11-12")))).afspraken).toHaveLength(0);
  });

  it("zonder voorkeur voor een medewerker krijgt de klant de eerste die vrij is", async () => {
    const twee = { ...i, medewerkers: [{ id: "jan01", naam: "Jan" }, { id: "els01", naam: "Els" }] };
    await bewaarInstellingen("t1", twee);
    await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ medewerkerId: "jan01" })), slug());
    const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ medewerkerId: "", klant: { naam: "Els Klant", telefoon: "", email: "klant@voorbeeld.nl" } })), slug());
    expect((await lees(res)).afspraak.medewerkerNaam).toBe("Els");
  });

  it("een tijd buiten de openingstijden of in het verleden wordt geweigerd, ook als de klant hem zelf verzint", async () => {
    for (const start of ["2026-11-12T20:00:00.000Z", "2026-11-11T08:00:00.000Z", "2026-11-12T08:07:00.000Z"]) {
      const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody({ start })), slug());
      expect(res.status, start).toBe(409);
    }
  });

  it("is IP-begrensd: de fout van de begrenzer komt terug en er wordt niets geboekt", async () => {
    m.limiet.mockRejectedValueOnce(Object.assign(new Error("te vaak"), { status: 429 }));
    const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2026-11-12")))).afspraken).toHaveLength(0);
  });
});

describe("beheer: /api/werkgever/afspraken", () => {
  it("zonder inlog 401, en een teamlid zonder beheerdersrol 423 met een eigen code en een uitleg (geen 403: CrowdSec)", async () => {
    m.ingelogd = false;
    expect((await beheer.GET(json("GET", "/api/werkgever/afspraken"))).status).toBe(401);
    m.ingelogd = true;
    m.admin = false;
    const geen = [await beheer.GET(json("GET", "/api/werkgever/afspraken")), await beheer.PUT(json("PUT", "/api/werkgever/afspraken", i)), await beheer.POST(json("POST", "/api/werkgever/afspraken", {})), await klanten.GET(json("GET", "/api/werkgever/klanten")), await klanten.DELETE(json("DELETE", "/api/werkgever/klanten?klant=e-a@b.nl"))];
    for (const res of geen) {
      expect(res.status).toBe(423);
      const e = (await lees(res)).error;
      expect(e.code).toBe("ALLEEN_BEHEERDER");
      expect(e.message).toMatch(/Alleen de beheerder van je organisatie/);
    }
    expect(m.kv.size).toBe(1 + 1); // alleen de instellingen en het boekadres van de beforeEach: niets gelezen of geschreven
  });

  it("GET zonder instellingen geeft een beginopzet met de bedrijfsnaam, nog niet bewaard", async () => {
    m.kv.clear();
    const b = await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken")));
    expect(b.nieuw).toBe(true);
    expect(b.instellingen.bedrijfsnaam).toBe("Kapper Jan");
    expect(b.instellingen.actief).toBe(false);
    expect(b.vandaag).toBe("2026-11-12");
    expect(m.kv.size).toBe(0);
  });

  it("PUT bewaart goede instellingen met een auditregel; een fout geeft 422 met een Nederlandse zin en bewaart niets", async () => {
    const goed = await beheer.PUT(json("PUT", "/api/werkgever/afspraken", { ...i, bedrijfsnaam: "Kapper Jan Zn", actief: true }));
    expect(goed.status).toBe(200);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "afspraken.instellingen", targetId: "t1" }));
    const fout = await beheer.PUT(json("PUT", "/api/werkgever/afspraken", { ...i, diensten: [] }));
    expect(fout.status).toBe(422);
    expect((await lees(fout)).error.message).toMatch(/minstens één dienst/);
  });

  it("PUT met een adres van een ander bedrijf geeft 409", async () => {
    await bewaarInstellingen("t2", { ...i, slug: "al-bezet", bedrijfsnaam: "Ander" });
    const res = await beheer.PUT(json("PUT", "/api/werkgever/afspraken", { ...i, slug: "al-bezet" }));
    expect(res.status).toBe(409);
  });

  it("POST: zelf een afspraak maken aan de balie, ook binnen de voorlooptijd, met alleen een naam", async () => {
    const res = await beheer.POST(json("POST", "/api/werkgever/afspraken", { dienstId: i.diensten[0]!.id, medewerkerId: i.medewerkers[0]!.id, start: "2026-11-12T09:30", klant: { naam: "Loopt binnen" } }));
    expect(res.status).toBe(200);
    const b = await lees(res);
    expect(b.afspraak).toMatchObject({ bron: "balie", start: "2026-11-12T08:30:00.000Z" }); // 09:30 Nederlandse tijd, het is nu 07:00
    expect(b.afspraak.klant).toEqual({ naam: "Loopt binnen", telefoon: "", email: "" });
  });

  it("POST zonder instellingen, met een onzintijd of zonder naam geeft een gewone fout", async () => {
    expect((await beheer.POST(json("POST", "/api/werkgever/afspraken", { start: "morgen", klant: { naam: "Piet" } }))).status).toBe(422);
    expect((await beheer.POST(json("POST", "/api/werkgever/afspraken", { dienstId: i.diensten[0]!.id, medewerkerId: i.medewerkers[0]!.id, start: "2026-11-12T10:00", klant: { naam: "" } }))).status).toBe(422);
    m.kv.clear();
    const leeg = await beheer.POST(json("POST", "/api/werkgever/afspraken", { start: "2026-11-12T10:00", klant: { naam: "Piet" } }));
    expect(leeg.status).toBe(422);
    expect((await lees(leeg)).error.message).toMatch(/Stel eerst/);
  });

  it("PATCH zet de status; een onbekende status of id geeft een nette fout", async () => {
    const a = (await lees(await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug()))).afspraak;
    expect(a.bevestigd).toBe(true);
    const lijst = await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2026-11-12")));
    const afspraakId = lijst.afspraken[0].id as string;
    const ok = await status.PATCH(json("PATCH", `/api/werkgever/afspraken/${afspraakId}`, { status: "geweest" }), id(afspraakId));
    expect((await lees(ok)).afspraak.status).toBe("geweest");
    expect((await status.PATCH(json("PATCH", "/x", { status: "weg" }), id(afspraakId))).status).toBe(422);
    expect((await status.PATCH(json("PATCH", "/x", { status: "geweest" }), id("../../x"))).status).toBe(404);
    expect((await status.PATCH(json("PATCH", "/x", { status: "geweest" }), id("2026-11-12~bestaatniet1"))).status).toBe(404);
  });

  it("de periode in GET wordt begrensd tot 62 dagen en een omgekeerde periode wordt één dag", async () => {
    const ver = await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2030-01-01")));
    expect(ver.tot).toBe("2027-01-13");
    const omgekeerd = await lees(await beheer.GET(json("GET", "/api/werkgever/afspraken?van=2026-11-12&tot=2026-11-01")));
    expect(omgekeerd.tot).toBe("2026-11-12");
  });
});

describe("beheer: /api/werkgever/klanten", () => {
  const sleutel = klantSleutel({ email: "piet@voorbeeld.nl", telefoon: "" });

  it("toont de klantenkaart na een boeking, bewaart een notitie en wist de klant helemaal", async () => {
    await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    const lijst = await lees(await klanten.GET(json("GET", "/api/werkgever/klanten")));
    expect(lijst.klanten).toHaveLength(1);
    expect(lijst.klanten[0]).toMatchObject({ naam: "Piet Jansen", sleutel, aantal: 1 });
    expect((await klanten.PUT(json("PUT", "/api/werkgever/klanten", { sleutel, notitie: "Korte baard" }))).status).toBe(200);
    expect((await lees(await klanten.GET(json("GET", `/api/werkgever/klanten?klant=${encodeURIComponent(sleutel)}`)))).afspraken).toHaveLength(1);
    expect((await lees(await klanten.GET(json("GET", "/api/werkgever/klanten")))).klanten[0].notitie).toBe("Korte baard");
    const wis = await lees(await klanten.DELETE(json("DELETE", `/api/werkgever/klanten?klant=${encodeURIComponent(sleutel)}`)));
    expect(wis.gewist).toBe(1);
    // in het auditspoor staat alleen een aantal, nooit wie het was
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/Piet|voorbeeld/);
    expect((await lees(await klanten.GET(json("GET", "/api/werkgever/klanten")))).klanten).toEqual([]);
  });

  it("een sleutel die geen klant is geeft een fout, ook een poging om iets anders te raken", async () => {
    for (const k of ["../x", "constructor", "e-geen-adres", "t-12", "x".repeat(300)]) {
      expect((await klanten.GET(json("GET", `/api/werkgever/klanten?klant=${encodeURIComponent(k)}`))).status, k).toBe(404);
      expect((await klanten.DELETE(json("DELETE", `/api/werkgever/klanten?klant=${encodeURIComponent(k)}`))).status, k).toBe(422);
      expect((await klanten.PUT(json("PUT", "/api/werkgever/klanten", { sleutel: k, notitie: "x" }))).status, k).toBe(422);
    }
  });
});
