import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mail, zelf annuleren en herinneringen voor de klant. Alles is gemockt: er gaat in deze test nooit een echte mail weg.
const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  mail: vi.fn(),
  melding: vi.fn(),
  limiet: vi.fn(),
  waarschuw: vi.fn(),
  gate: { ok: true } as { ok: boolean; status?: number; message?: string },
  cron: vi.fn(),
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
  kvDeleteStale: async (p: string) => {
    let n = 0;
    for (const k of [...m.kv.keys()]) if (k.startsWith(p)) (m.kv.delete(k), (n += 1));
    return n;
  },
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://app.zekerflex.test/" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => m.waarschuw(...a), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => m.mail(...a),
  escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
}));
vi.mock("@/lib/afspraken/melding", () => ({ meldBedrijf: (...a: unknown[]) => m.melding(...a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.limiet(...a) }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: () => m.gate }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: (...a: unknown[]) => m.cron(...a) }));

import * as publiek from "@/app/api/boeken/[slug]/route";
import * as annuleer from "@/app/api/boeken/[slug]/afspraak/route";
import * as cron from "@/app/api/internal/afspraken/herinneringen/route";
import { ANNULEER_STANDAARD, annuleerBezwaar, beginInstellingen, controleerInstellingen, datumTijdLang, heeftPersoon, herinneringDue, zonderPersoon, type Afspraak } from "@/lib/afspraken/model";
import { icsVoorAfspraak, klantMail, stuurBevestiging } from "@/lib/afspraken/mail";
import { stuurHerinneringen } from "@/lib/afspraken/herinneringen";
import { wisVerlopenAfspraken } from "@/lib/afspraken/bewaren";
import { afspraakVanLink, bewaarInstellingen, leesAfspraak, nieuwId, verwijderKlant, wisAfsprakenVanOrganisatie } from "@/lib/afspraken/store";
import { LINK_ONBEKEND_TEKST } from "@/lib/afspraken/teksten";

const url = (p: string) => `http://app:3000${p}`;
const json = (method: string, p: string, body?: unknown) => new Request(url(p), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const slug = (s = "kapper-jan") => ({ params: Promise.resolve({ slug: s }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;
/** de achtergrondtaken (runAfter buiten een request: gewoon "vuur en vergeet") laten uitlopen */
const klaar = () => new Promise<void>((r) => setTimeout(r, 25));

const NU = new Date("2026-11-12T06:00:00Z"); // donderdag 07:00 in Nederland
const klant = { naam: "Piet Jansen", telefoon: "06 1234 5678", email: "piet@voorbeeld.nl" };
let i = { ...beginInstellingen("Kapper Jan", nieuwId), actief: true };
const boekBody = (over: Record<string, unknown> = {}) => ({ dienstId: i.diensten[0]!.id, medewerkerId: i.medewerkers[0]!.id, start: "2026-11-12T08:00:00.000Z", klant, toestemming: true, opmerking: "", website: "", ...over });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  m.kv.clear();
  m.mail.mockReset().mockResolvedValue({ id: "x", delivered: true, transport: "mailbox" });
  m.melding.mockReset().mockResolvedValue(undefined);
  m.limiet.mockReset().mockResolvedValue(undefined);
  m.waarschuw.mockReset();
  m.cron.mockReset();
  m.gate = { ok: true };
  i = { ...beginInstellingen("Kapper Jan", nieuwId), actief: true };
  await bewaarInstellingen("t1", i);
});
afterEach(() => vi.useRealTimers());

/** De link uit de laatste mail: [volledige link, token]. */
const linkUitMail = (n = -1): [string, string] => {
  const call = m.mail.mock.calls.at(n)?.[0] as { text: string };
  const hit = /(https:\/\/app\.zekerflex\.test\/boeken\/[a-z0-9-]+\/afspraak\/([A-Za-z0-9_-]+))/.exec(call.text);
  if (!hit) throw new Error("geen link in de mail");
  return [hit[1]!, hit[2]!];
};
const boekOnline = async (over: Record<string, unknown> = {}) => {
  const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody(over)), slug());
  expect(res.status).toBe(200);
  await klaar();
  return res;
};
const afspraakVanDag = (tenant = "t1") => [...m.kv].filter(([k]) => k.startsWith(`afspraken:item:${tenant}:`)).map(([, v]) => v as Afspraak);

/** Zet een afspraak (en zijn plek in het herinneringsrijtje) rechtstreeks in de opslag. */
const zetAfspraak = (startIso: string, over: Partial<Afspraak> = {}, tenant = "t1", metRij = true): Afspraak => {
  const dag = new Date(startIso).toISOString().slice(0, 10);
  const a: Afspraak = {
    id: `${dag}~${Math.random().toString(36).slice(2, 12).padEnd(10, "a")}`,
    dienstId: i.diensten[0]!.id,
    dienstNaam: "Knippen",
    duurMin: 30,
    prijsCent: null,
    medewerkerId: i.medewerkers[0]!.id,
    medewerkerNaam: "Jan",
    start: startIso,
    eind: new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString(),
    klant,
    opmerking: "",
    status: "bevestigd",
    bron: "online",
    gemaaktOp: "2026-11-01T10:00:00.000Z",
    ...over,
  };
  m.kv.set(`afspraken:item:${tenant}:${a.id}`, a);
  if (metRij) m.kv.set(`afspraken:rem:${tenant}:${a.id}`, { tenantId: tenant, id: a.id, start: a.start });
  return a;
};

describe("de regels (puur)", () => {
  const a = { status: "bevestigd" as const, start: "2026-11-12T08:00:00.000Z" };

  it("annuleren kan tot annuleerTotMin voor de start: precies op de grens mag, een minuut later niet", () => {
    expect(annuleerBezwaar(a, {}, new Date("2026-11-12T06:00:00Z"))).toBeNull(); // precies 2 uur
    expect(annuleerBezwaar(a, {}, new Date("2026-11-12T06:00:01Z"))).toBe("te-laat");
    expect(annuleerBezwaar(a, { annuleerTotMin: 0 }, new Date("2026-11-12T07:59:59Z"))).toBeNull();
    expect(annuleerBezwaar(a, { annuleerTotMin: 1440 }, new Date("2026-11-12T06:00:00Z"))).toBe("te-laat");
  });

  it("verstreken, al geannuleerd en afgehandeld krijgen elk hun eigen reden", () => {
    expect(annuleerBezwaar(a, {}, new Date("2026-11-12T08:00:00Z"))).toBe("verstreken");
    expect(annuleerBezwaar(a, {}, new Date("2026-11-13T08:00:00Z"))).toBe("verstreken");
    expect(annuleerBezwaar({ ...a, status: "geannuleerd" }, {}, new Date("2026-11-13T08:00:00Z"))).toBe("al-geannuleerd");
    expect(annuleerBezwaar({ ...a, status: "geweest" }, {}, new Date("2026-11-11T08:00:00Z"))).toBe("verstreken");
  });

  it("bestaande instellingen zonder de nieuwe velden krijgen de standaard (120 minuten, herinnering aan)", () => {
    expect(ANNULEER_STANDAARD).toBe(120);
    const r = controleerInstellingen({ ...i, annuleerTotMin: undefined, herinneringAan: undefined }, nieuwId);
    expect(r.ok && r.waarde).toMatchObject({ annuleerTotMin: 120, herinneringAan: true });
    const uit = controleerInstellingen({ ...i, annuleerTotMin: 60, herinneringAan: false }, nieuwId);
    expect(uit.ok && uit.waarde).toMatchObject({ annuleerTotMin: 60, herinneringAan: false });
  });

  it("een onzinwaarde voor annuleerTotMin is een Nederlandse fout", () => {
    for (const waarde of [-1, 1.5, 99_999, "morgen"]) {
      const r = controleerInstellingen({ ...i, annuleerTotMin: waarde }, nieuwId);
      expect(r.ok, String(waarde)).toBe(false);
      expect(!r.ok && r.fout).toMatch(/annuleren/);
    }
  });

  it("datum en tijd zijn volledig uitgeschreven in Nederlandse tijd, ook in de winter en de zomer", () => {
    expect(datumTijdLang("2026-11-12T08:00:00.000Z")).toBe("donderdag 12 november 2026 om 09:00");
    expect(datumTijdLang("2026-07-14T07:30:00.000Z")).toBe("dinsdag 14 juli 2026 om 09:30");
  });

  it("een herinnering hoort alleen bij een bevestigde afspraak met e-mail, binnen 24 uur vóór de start, nog niet gestuurd", () => {
    const basis = zetAfspraak("2026-11-13T08:00:00.000Z", {}, "t1", false);
    const nu = new Date("2026-11-12T08:00:00Z"); // precies 24 uur ervoor
    expect(herinneringDue(basis, {}, nu)).toBe(true);
    expect(herinneringDue(basis, {}, new Date("2026-11-12T07:59:59Z"))).toBe(false);
    expect(herinneringDue(basis, {}, new Date("2026-11-13T08:00:00Z"))).toBe(false); // begonnen
    expect(herinneringDue({ ...basis, status: "geannuleerd" }, {}, nu)).toBe(false);
    expect(herinneringDue({ ...basis, status: "niet-gekomen" }, {}, nu)).toBe(false);
    expect(herinneringDue({ ...basis, klant: { ...klant, email: "" } }, {}, nu)).toBe(false);
    expect(herinneringDue({ ...basis, herinneringVerstuurd: true }, {}, nu)).toBe(false);
    expect(herinneringDue(basis, { herinneringAan: false }, nu)).toBe(false);
  });
});

describe("de mail zelf", () => {
  const a: Afspraak = { ...zetAfspraak("2026-11-12T08:00:00.000Z", {}, "t1", false), medewerkerNaam: "Els <b>", dienstNaam: "Knippen & scheren" };

  it("bevat bedrijf, dienst, medewerker, tijd, duur en de link; de html is veilig", () => {
    const t = klantMail("bevestiging", a, { bedrijfsnaam: "Kapper Jan", annuleerTotMin: 120 }, "https://app.zekerflex.test/boeken/kapper-jan/afspraak/abc");
    expect(t.onderwerp).toBe("Je afspraak bij Kapper Jan op donderdag 12 november 2026 om 09:00");
    for (const s of ["Kapper Jan", "Knippen & scheren bij Els <b>", "donderdag 12 november 2026 om 09:00", "30 minuten", "https://app.zekerflex.test/boeken/kapper-jan/afspraak/abc", "Annuleren kan tot 2 uur voor de afspraak."]) expect(t.tekst).toContain(s);
    expect(t.html).toContain("Afspraak annuleren");
    expect(t.html).toContain("Knippen &amp; scheren bij Els &lt;b&gt;");
    expect(t.html).not.toContain("<b>");
  });

  it("de herinnering heet zo, en de bevestiging van annuleren wijst naar de boekpagina", () => {
    expect(klantMail("herinnering", a, { bedrijfsnaam: "Kapper Jan", annuleerTotMin: 0 }, "https://x/y").onderwerp).toMatch(/^Herinnering: je afspraak/);
    expect(klantMail("herinnering", a, { bedrijfsnaam: "Kapper Jan", annuleerTotMin: 0 }, "https://x/y").tekst).toContain("Annuleren kan tot het moment dat de afspraak begint.");
    const t = klantMail("geannuleerd", a, { bedrijfsnaam: "Kapper Jan", annuleerTotMin: 120 }, "https://app.zekerflex.test/boeken/kapper-jan");
    expect(t.onderwerp).toBe("Je afspraak bij Kapper Jan is geannuleerd");
    expect(t.html).toContain("Nieuwe afspraak maken");
  });

  it(".ics: tijden in UTC met Z, vaste UID, geen gegevens van de klant", () => {
    const ics = icsVoorAfspraak(a, "Kapper Jan", new Date("2026-11-12T06:00:00Z"));
    expect(ics).toContain("DTSTART:20261112T080000Z");
    expect(ics).toContain("DTEND:20261112T083000Z");
    expect(ics).toContain("DTSTAMP:20261112T060000Z");
    expect(ics).toContain(`UID:afspraak-${a.id}@zekerflex.com`);
    expect(ics).toContain("SUMMARY:Knippen & scheren bij Kapper Jan");
    expect(ics).toContain("\r\n");
    expect(ics).not.toMatch(/Piet|voorbeeld|0612/);
  });
});

describe("bevestiging bij het boeken", () => {
  it("met een e-mailadres: één mail aan de klant, met .ics en een persoonlijke link; het token staat nergens leesbaar", async () => {
    const res = await boekOnline();
    expect(m.mail).toHaveBeenCalledTimes(1);
    const mail = m.mail.mock.calls[0]![0] as { to: string; subject: string; text: string; attachments: { filename: string; contentType: string; content: string }[] };
    expect(mail.to).toBe("piet@voorbeeld.nl");
    expect(mail.subject).toContain("donderdag 12 november 2026 om 09:00");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({ filename: "afspraak.ics", contentType: expect.stringContaining("text/calendar") });
    expect(mail.attachments[0]!.content).toContain("DTSTART:20261112T080000Z");
    const [, token] = linkUitMail();
    expect(token.length).toBeGreaterThanOrEqual(24);
    // alleen de hash is bewaard, het antwoord aan de browser en het log bevatten niets
    const [a] = afspraakVanDag();
    expect(a!.tokenHashes).toHaveLength(1);
    expect(JSON.stringify([...m.kv])).not.toContain(token);
    expect(JSON.stringify(await lees(res))).not.toContain(token);
    expect(JSON.stringify(m.waarschuw.mock.calls)).not.toContain(token);
  });

  it("zonder e-mailadres (alleen telefoon) gaat er geen mail weg", async () => {
    await boekOnline({ klant: { naam: "Els Klant", telefoon: "06 1234 5678", email: "" } });
    expect(m.mail).not.toHaveBeenCalled();
    expect(afspraakVanDag()[0]!.tokenHashes).toBeUndefined();
    expect([...m.kv.keys()].some((k) => k.startsWith("afspraken:rem:"))).toBe(false);
  });

  it("een mail die mislukt (gooit, of meldt een bezorgfout) laat het boeken slagen en laat geen dode link staan", async () => {
    m.mail.mockRejectedValueOnce(new Error("smtp stuk"));
    await boekOnline();
    m.mail.mockResolvedValueOnce({ id: "y", delivered: false, transport: "smtp", error: "550" });
    await boekOnline({ start: "2026-11-12T09:00:00.000Z" });
    expect(afspraakVanDag()).toHaveLength(2);
    for (const a of afspraakVanDag()) expect(a.tokenHashes ?? []).toEqual([]);
    expect([...m.kv.keys()].filter((k) => k.startsWith("afspraken:tok:"))).toEqual([]);
    expect(JSON.stringify(m.waarschuw.mock.calls)).not.toMatch(/voorbeeld|piet/i);
  });

  it("een mail die nooit klaar komt laat het antwoord niet wachten", async () => {
    m.mail.mockReturnValueOnce(new Promise(() => undefined));
    const res = await publiek.POST(json("POST", "/api/boeken/kapper-jan", boekBody()), slug());
    expect(res.status).toBe(200);
  });

  it("een afspraak aan de balie (door het bedrijf zelf gemaakt) krijgt geen mail en geen herinnering", async () => {
    const a = zetAfspraak("2026-11-13T08:00:00.000Z", { bron: "balie" }, "t1", false);
    await stuurBevestiging("t1", a, i, NU);
    expect(m.mail).not.toHaveBeenCalled();
  });
});

describe("annuleren door de klant: POST /api/boeken/<slug>/afspraak", () => {
  const annuleerMet = (token: string, over: Record<string, unknown> = {}, s = "kapper-jan") => annuleer.POST(json("POST", `/api/boeken/${s}/afspraak`, { token, ...over }), slug(s));
  const nieuweBoeking = async (over: Record<string, unknown> = {}) => {
    await boekOnline(over);
    return linkUitMail()[1];
  };

  it("annuleert, meldt het bedrijf, bevestigt aan de klant en maakt de tijd vrij", async () => {
    const token = await nieuweBoeking();
    const voor = await lees(await publiek.GET(json("GET", `/api/boeken/kapper-jan?dienst=${i.diensten[0]!.id}&dag=2026-11-12`), slug()));
    expect(voor.tijden).not.toContain("2026-11-12T08:00:00.000Z");
    m.mail.mockClear();
    m.melding.mockClear();
    const res = await annuleerMet(token);
    expect(res.status).toBe(200);
    expect(await lees(res)).toEqual({ geannuleerd: true });
    await klaar();
    expect(afspraakVanDag()[0]!.status).toBe("geannuleerd");
    expect(m.melding).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "geannuleerd" }), "geannuleerd");
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect((m.mail.mock.calls[0]![0] as { subject: string; text: string }).subject).toContain("is geannuleerd");
    expect((m.mail.mock.calls[0]![0] as { text: string }).text).toContain("https://app.zekerflex.test/boeken/kapper-jan");
    const na = await lees(await publiek.GET(json("GET", `/api/boeken/kapper-jan?dienst=${i.diensten[0]!.id}&dag=2026-11-12`), slug()));
    expect(na.tijden).toContain("2026-11-12T08:00:00.000Z");
    // de herinnering is mee weggehaald
    expect([...m.kv.keys()].some((k) => k.startsWith("afspraken:rem:"))).toBe(false);
  });

  it("dubbel annuleren: de tweede keer een nette uitleg, geen tweede melding of mail", async () => {
    const token = await nieuweBoeking();
    await annuleerMet(token);
    await klaar();
    m.mail.mockClear();
    m.melding.mockClear();
    const dubbel = await annuleerMet(token);
    expect(dubbel.status).toBe(409);
    const b = await lees(dubbel);
    expect(b.reden).toBe("al-geannuleerd");
    expect(b.error.message).toMatch(/al geannuleerd/);
    await klaar();
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.melding).not.toHaveBeenCalled();
  });

  it("te laat (binnen 2 uur van de start): 409 met uitleg, en de afspraak blijft staan", async () => {
    const token = await nieuweBoeking();
    vi.setSystemTime(new Date("2026-11-12T06:01:00Z")); // nog 119 minuten
    m.melding.mockClear();
    const res = await annuleerMet(token);
    expect(res.status).toBe(409);
    const b = await lees(res);
    expect(b.reden).toBe("te-laat");
    expect(b.error.message).toMatch(/tot 2 uur voor de afspraak/);
    expect(afspraakVanDag()[0]!.status).toBe("bevestigd");
    expect(m.melding).not.toHaveBeenCalled();
  });

  it("precies 2 uur van tevoren mag nog", async () => {
    const token = await nieuweBoeking();
    vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
    expect((await annuleerMet(token)).status).toBe(200);
  });

  it("het bedrijf kiest zelf tot wanneer: 0 minuten tot de start, of een dag van tevoren", async () => {
    const token = await nieuweBoeking();
    await bewaarInstellingen("t1", { ...i, annuleerTotMin: 1440 });
    expect((await annuleerMet(token)).status).toBe(409);
    await bewaarInstellingen("t1", { ...i, annuleerTotMin: 0 });
    vi.setSystemTime(new Date("2026-11-12T07:59:00Z"));
    expect((await annuleerMet(token)).status).toBe(200);
  });

  it("een afspraak die al geweest is geeft een nette uitleg", async () => {
    const token = await nieuweBoeking();
    vi.setSystemTime(new Date("2026-11-12T09:00:00Z"));
    const res = await annuleerMet(token);
    expect(res.status).toBe(409);
    expect((await lees(res)).reden).toBe("verstreken");
  });

  it("een onbekende, verkeerde, te korte of niet-tekst-token geeft altijd dezelfde 404", async () => {
    const token = await nieuweBoeking();
    const verkeerd = [`${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`, "x".repeat(32), "kort", "../../x", "", "constructor", 12345 as unknown as string];
    const antwoorden = [];
    for (const t of verkeerd) {
      const res = await annuleerMet(t);
      expect(res.status, String(t)).toBe(404);
      antwoorden.push((await lees(res)).error.message);
    }
    expect(new Set(antwoorden)).toEqual(new Set([LINK_ONBEKEND_TEKST]));
    expect((await annuleer.POST(json("POST", "/api/boeken/kapper-jan/afspraak", { geen: "token" }), slug())).status).toBe(404);
    expect(afspraakVanDag()[0]!.status).toBe("bevestigd");
  });

  it("de link van een ander bedrijf werkt niet bij dit adres (en andersom), met dezelfde 404", async () => {
    const token = await nieuweBoeking();
    await bewaarInstellingen("t2", { ...beginInstellingen("Ander Bedrijf", nieuwId), slug: "ander-bedrijf", actief: true });
    const res = await annuleerMet(token, {}, "ander-bedrijf");
    expect(res.status).toBe(404);
    expect((await lees(res)).error.message).toBe(LINK_ONBEKEND_TEKST);
    expect((await annuleerMet(token, {}, "bestaat-niet")).status).toBe(404);
    expect((await annuleerMet(token, {}, "constructor")).status).toBe(404);
    expect(afspraakVanDag()[0]!.status).toBe("bevestigd");
  });

  it("annuleren kan ook als het bedrijf online boeken later heeft dichtgezet", async () => {
    const token = await nieuweBoeking();
    await bewaarInstellingen("t1", { ...i, actief: false });
    expect((await annuleerMet(token)).status).toBe(200);
  });

  it("een ingevuld verborgen veld (bot) lijkt te lukken maar doet niets; de IP-begrenzing werkt", async () => {
    const token = await nieuweBoeking();
    const bot = await annuleerMet(token, { website: "https://spam.example" });
    expect(bot.status).toBe(200);
    expect(afspraakVanDag()[0]!.status).toBe("bevestigd");
    m.limiet.mockRejectedValueOnce(Object.assign(new Error("te vaak"), { status: 429 }));
    expect((await annuleerMet(token)).status).toBeGreaterThanOrEqual(400);
    expect(afspraakVanDag()[0]!.status).toBe("bevestigd");
  });

  it("het antwoord geeft nooit een id of token terug, en een mail die faalt laat het annuleren slagen", async () => {
    const token = await nieuweBoeking();
    m.mail.mockRejectedValueOnce(new Error("smtp stuk"));
    m.melding.mockRejectedValueOnce(new Error("push stuk"));
    const res = await annuleerMet(token);
    expect(res.status).toBe(200);
    expect(JSON.stringify(await lees(res))).not.toMatch(/token|2026-11-12~/);
    await klaar();
    expect(afspraakVanDag()[0]!.status).toBe("geannuleerd");
  });
});

describe("herinneringen (cron, elk uur)", () => {
  const vraag = (q = "") => new Request(`http://app:3000/api/internal/afspraken/herinneringen${q}`, { method: "POST" });
  const VR13 = "2026-11-13T08:00:00.000Z"; // vrijdag 09:00 in Nederland

  it("verstuurt precies één keer, en pas binnen 24 uur vóór de start", async () => {
    const a = zetAfspraak(VR13);
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T07:59:00Z") })).toMatchObject({ verstuurd: 0 });
    expect(m.mail).not.toHaveBeenCalled();
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T08:00:00Z") })).toMatchObject({ verstuurd: 1, mislukt: 0 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    const mail = m.mail.mock.calls[0]![0] as { to: string; subject: string; text: string; attachments: unknown[] };
    expect(mail.to).toBe("piet@voorbeeld.nl");
    expect(mail.subject).toMatch(/^Herinnering: .* vrijdag 13 november 2026 om 09:00$/);
    expect(mail.attachments).toHaveLength(1);
    // de volgende uren niets meer
    for (const uur of ["09:00", "10:00", "20:00"]) expect(await stuurHerinneringen({ now: new Date(`2026-11-12T${uur}:00Z`) })).toMatchObject({ verstuurd: 0 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect((await leesAfspraak("t1", a.id))!.herinneringVerstuurd).toBe(true);
    expect([...m.kv.keys()].some((k) => k.startsWith("afspraken:rem:"))).toBe(false);
  });

  it("dezelfde link als in de bevestiging werkt nog, en de herinnering heeft een eigen link", async () => {
    await boekOnline({ start: VR13 });
    const [, eerste] = linkUitMail();
    await stuurHerinneringen({ now: new Date("2026-11-12T08:00:00Z") });
    const [, tweede] = linkUitMail();
    expect(tweede).not.toBe(eerste);
    expect(await afspraakVanLink("kapper-jan", eerste)).not.toBeNull();
    expect(await afspraakVanLink("kapper-jan", tweede)).not.toBeNull();
    expect(afspraakVanDag()[0]!.tokenHashes).toHaveLength(2);
  });

  it("een mislukte mail probeert het volgende uur opnieuw, tot de afspraak begint, en hoopt geen links op", async () => {
    const a = zetAfspraak(VR13);
    m.mail.mockRejectedValue(new Error("smtp stuk"));
    for (const uur of ["08:00", "09:00", "10:00"]) expect(await stuurHerinneringen({ now: new Date(`2026-11-12T${uur}:00Z`) })).toMatchObject({ verstuurd: 0, mislukt: 1 });
    expect((await leesAfspraak("t1", a.id))!.herinneringVerstuurd).toBeUndefined();
    expect((await leesAfspraak("t1", a.id))!.tokenHashes ?? []).toEqual([]);
    m.mail.mockResolvedValue({ id: "x", delivered: true, transport: "mailbox" });
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T11:00:00Z") })).toMatchObject({ verstuurd: 1, mislukt: 0 });
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T12:00:00Z") })).toMatchObject({ verstuurd: 0 });
    // en na de start wordt er nooit meer geprobeerd
    const laat = zetAfspraak("2026-11-12T20:00:00.000Z");
    m.mail.mockRejectedValue(new Error("smtp stuk"));
    await stuurHerinneringen({ now: new Date("2026-11-12T19:00:00Z") });
    m.mail.mockClear();
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T20:00:00Z") })).toMatchObject({ verstuurd: 0, mislukt: 0, opgeruimd: 1 });
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.kv.has(`afspraken:rem:t1:${laat.id}`)).toBe(false);
  });

  it("alleen bevestigde afspraken met een e-mailadres; geannuleerd, geweest, niet gekomen, zonder e-mail en buiten het venster niet", async () => {
    zetAfspraak(VR13, { status: "geannuleerd" });
    zetAfspraak(VR13, { status: "geweest" });
    zetAfspraak(VR13, { status: "niet-gekomen" });
    zetAfspraak(VR13, { klant: { ...klant, email: "" } });
    zetAfspraak("2026-11-14T08:00:00.000Z"); // pas over 48 uur
    const goed = zetAfspraak("2026-11-13T07:00:00.000Z");
    const uit = await stuurHerinneringen({ now: new Date("2026-11-12T08:00:00Z") });
    expect(uit).toMatchObject({ verstuurd: 1 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect((await leesAfspraak("t1", goed.id))!.herinneringVerstuurd).toBe(true);
  });

  it("een bedrijf kan herinneringen uitzetten; aanzetten werkt daarna ook voor bestaande afspraken", async () => {
    await bewaarInstellingen("t1", { ...i, herinneringAan: false });
    zetAfspraak(VR13);
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T09:00:00Z") })).toMatchObject({ verstuurd: 0 });
    expect(m.mail).not.toHaveBeenCalled();
    await bewaarInstellingen("t1", { ...i, herinneringAan: true });
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T10:00:00Z") })).toMatchObject({ verstuurd: 1 });
  });

  it("per bedrijf eigen instellingen: een ander bedrijf met herinneringen uit houdt de zijne tegen", async () => {
    await bewaarInstellingen("t2", { ...beginInstellingen("Ander", nieuwId), slug: "ander", actief: true, herinneringAan: false });
    zetAfspraak(VR13, {}, "t2");
    zetAfspraak(VR13, {}, "t1");
    expect(await stuurHerinneringen({ now: new Date("2026-11-12T09:00:00Z") })).toMatchObject({ verstuurd: 1 });
  });

  it("rond de overgang naar wintertijd telt het echte etmaal, niet de klokkentijd", async () => {
    // zondag 25 oktober 2026 09:00 Nederlandse tijd = 08:00Z (de klok ging die nacht een uur terug)
    const a = zetAfspraak("2026-10-25T08:00:00.000Z");
    expect(await stuurHerinneringen({ now: new Date("2026-10-24T07:59:00Z") })).toMatchObject({ verstuurd: 0 }); // zaterdag 09:59 zomertijd: 24 uur en 1 minuut
    expect(await stuurHerinneringen({ now: new Date("2026-10-24T08:00:00Z") })).toMatchObject({ verstuurd: 1 });
    expect((m.mail.mock.calls[0]![0] as { text: string }).text).toContain("zondag 25 oktober 2026 om 09:00");
    expect((await leesAfspraak("t1", a.id))!.herinneringVerstuurd).toBe(true);
  });

  it("rond de overgang naar zomertijd ook", async () => {
    // zondag 28 maart 2027 09:00 Nederlandse (zomer)tijd = 07:00Z
    zetAfspraak("2027-03-28T07:00:00.000Z");
    expect(await stuurHerinneringen({ now: new Date("2027-03-27T06:59:00Z") })).toMatchObject({ verstuurd: 0 });
    expect(await stuurHerinneringen({ now: new Date("2027-03-27T07:00:00Z") })).toMatchObject({ verstuurd: 1 });
    expect((m.mail.mock.calls[0]![0] as { text: string }).text).toContain("zondag 28 maart 2027 om 09:00");
  });

  it("dryRun telt alleen: geen mail, geen vlag, geen opruiming", async () => {
    const a = zetAfspraak(VR13);
    zetAfspraak("2026-11-12T05:00:00.000Z"); // al begonnen: zou worden opgeruimd
    const uit = await stuurHerinneringen({ now: new Date("2026-11-12T08:00:00Z"), dryRun: true });
    expect(uit).toMatchObject({ verstuurd: 1, opgeruimd: 1 });
    expect(m.mail).not.toHaveBeenCalled();
    expect((await leesAfspraak("t1", a.id))!.herinneringVerstuurd).toBeUndefined();
    expect([...m.kv.keys()].filter((k) => k.startsWith("afspraken:rem:"))).toHaveLength(2);
  });

  it("de cron-route: zonder token 401, met token een uitslag, dryRun via de querystring, en de hartslag", async () => {
    m.gate = { ok: false, status: 401, message: "nee" };
    expect((await cron.POST(vraag())).status).toBe(401);
    m.gate = { ok: true };
    zetAfspraak("2026-11-12T20:00:00.000Z"); // nu is 06:00Z: binnen 24 uur
    const droog = await lees(await cron.POST(vraag("?dryRun=1")));
    expect(droog).toMatchObject({ ok: true, dryRun: true, verstuurd: 1 });
    expect(m.mail).not.toHaveBeenCalled();
    const echt = await lees(await cron.GET(vraag()));
    expect(echt).toMatchObject({ ok: true, dryRun: false, verstuurd: 1 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.cron).toHaveBeenCalledWith("afspraken-herinneringen", true);
  });
});

describe("wissen maakt de link dood (AVG)", () => {
  const metLink = async () => {
    await boekOnline();
    const [, token] = linkUitMail();
    expect(await afspraakVanLink("kapper-jan", token)).not.toBeNull();
    return token;
  };
  const toegangsSleutels = () => [...m.kv.keys()].filter((k) => k.startsWith("afspraken:tok:") || k.startsWith("afspraken:rem:"));

  it("een klant wissen (verwijderKlant): geen hash, geen link, geen herinnering meer", async () => {
    const token = await metLink();
    expect(toegangsSleutels()).toHaveLength(2);
    await verwijderKlant("t1", "e-piet@voorbeeld.nl");
    const [a] = afspraakVanDag();
    expect(a!.tokenHashes).toBeUndefined();
    expect(heeftPersoon(a!)).toBe(false);
    expect(toegangsSleutels()).toEqual([]);
    expect(await afspraakVanLink("kapper-jan", token)).toBeNull();
    const res = await annuleer.POST(json("POST", "/api/boeken/kapper-jan/afspraak", { token }), slug());
    expect(res.status).toBe(404);
    expect((await lees(res)).error.message).toBe(LINK_ONBEKEND_TEKST);
    expect(a!.status).toBe("bevestigd"); // de afspraak zelf blijft voor de agenda
  });

  it("de bewaartermijn (2 jaar) haalt de link ook weg", async () => {
    const token = await metLink();
    const uit = await wisVerlopenAfspraken({ now: new Date("2028-11-20T06:00:00Z") });
    expect(uit.gewist).toBe(1);
    expect(afspraakVanDag()[0]!.tokenHashes).toBeUndefined();
    expect(toegangsSleutels()).toEqual([]);
    expect(await afspraakVanLink("kapper-jan", token)).toBeNull();
  });

  it("de hash alleen verwijderen volstaat: een achtergebleven zoekregel toont niets zonder hash bij de afspraak", async () => {
    const token = await metLink();
    const [sleutel, a] = [...m.kv].find(([k]) => k.startsWith("afspraken:item:t1:")) as [string, Afspraak];
    m.kv.set(sleutel, zonderPersoon(a));
    expect(toegangsSleutels().length).toBeGreaterThan(0);
    expect(await afspraakVanLink("kapper-jan", token)).toBeNull();
  });

  it("het wissen van een hele organisatie verwijdert ook de zoekregels van links en het herinneringsrijtje, en het boekadres", async () => {
    const orgId = "organisatie-abc123";
    await bewaarInstellingen(orgId, { ...beginInstellingen("Bedrijf Drie", nieuwId), slug: "bedrijf-drie", actief: true });
    m.kv.set(`afspraken:tok:${orgId}:hash1`, { id: "x" });
    m.kv.set(`afspraken:rem:${orgId}:2026-11-13~abcdefghij`, { tenantId: orgId });
    await wisAfsprakenVanOrganisatie(orgId, NU);
    expect([...m.kv.keys()].filter((k) => k.includes(orgId))).toEqual([]);
    expect(await afspraakVanLink("bedrijf-drie", "a".repeat(32))).toBeNull();
  });
});
