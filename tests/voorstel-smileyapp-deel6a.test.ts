import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// SmileyApp-voorstel, deel 6a (19 nov 2026): de opvolglijst (status en notities),
// de agenda voor demo-afspraken (openzetten, atomair boeken, annuleren, het
// agendabestand), de veelgestelde vragen die het team zelf beheert, de
// wekelijkse mail aan de beheerders en de poster om te printen. Deze test
// bewaakt de pure regels van elk onderdeel, het bewaren, en in de broncode: elke
// nieuwe route begint met de poort en de sessie (of het interne geheim), de site
// en de chat lezen de vragen uit één bron, en de poster laadt niets van buiten.
// Tijden: de klok staat stil en elke datum heeft een zone.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  mails: [] as { to: string; subject: string; text: string; html?: string; kind?: string; attachments?: { filename: string; contentType: string; content: string | Buffer }[] }[],
  weergaven: 37 as number | null,
  chats: [] as { gestart: string }[],
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "geheim-voor-de-test-van-minstens-32-tekens", APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/storage/kv", () => {
  const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const rijen = (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix));
  const veld = (k: string, naam: string) => (h.kv.get(k) as Record<string, unknown> | undefined)?.[naam] ?? null;
  return {
    kvGet: async (k: string) => (h.kv.has(k) ? kopie(h.kv.get(k)) : null),
    kvSet: async (k: string, v: unknown) => void h.kv.set(k, kopie(v)),
    kvDelete: async (k: string) => void h.kv.delete(k),
    kvListKeys: async (prefix: string) => rijen(prefix).map(([k]) => k),
    kvListValues: async (prefix: string) => rijen(prefix).map(([, v]) => kopie(v)),
    kvListEntries: async (prefix: string) => rijen(prefix).map(([key, value]) => ({ key, value: kopie(value) })),
    // zoals de echte opslag: alleen schrijven als de sleutel er nog niet is
    kvSetIfAbsent: async (k: string, v: unknown) => (h.kv.has(k) ? false : (h.kv.set(k, kopie(v)), true)),
    // zoals de echte opslag: alleen vervangen als het veld nog de oude waarde heeft (null = het veld ontbreekt)
    kvVervangAlsVeld: async (k: string, naam: string, oud: string | null, nieuw: unknown) => (h.kv.has(k) && veld(k, naam) === oud ? (h.kv.set(k, kopie(nieuw)), true) : false),
    kvVerwijderAlsVeld: async (k: string, naam: string, waarde: string) => (h.kv.has(k) && veld(k, naam) === waarde ? h.kv.delete(k) : false),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ getPrincipal: async () => null, hasRole: () => false }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: (typeof h.mails)[number]) => {
    h.mails.push(m);
    return { id: "t", delivered: true, transport: "mailbox" };
  },
}));
vi.mock("@/lib/voorstel/smileyapp-cijfers", () => ({
  telDemoAanvraag: async () => undefined,
  telWeergave: async () => undefined,
  smileyappCijfers: async () => {
    if (h.weergaven === null) throw new Error("redis weg");
    return { weergaven: h.weergaven };
  },
}));
vi.mock("@/lib/sitechat/gesprek", () => ({ gesprekken: async () => h.chats }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }), fixedWindow: async () => ({ ok: true }) }));

import { AppError } from "@/lib/errors";
import { WATCHED_CRONS } from "@/lib/ops/heartbeat";
import { PAKKETTEN, veelgesteld } from "@/lib/voorstel/smileyapp";
import { NOTITIES_MAX, NOTITIE_TEKST_MAX, STATUSSEN, STATUS_LABEL, isStatus, metNotitie, statusNaAnnuleren, valideerAanvraag, type Aanvraag, type AanvraagInvoer, type Notitie } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { alleAanvragen, maakAanvraag, verwijderNotitie, voegNotitieToe } from "@/lib/voorstel/smileyapp-aanvragen";
import { afspraakInTaal, afsprakenVoorSite, agendaVoorBeheer, alleTijden, annuleerBoeking, boekTijd, haalTijdWeg, openTijden, zetTijdOpen } from "@/lib/voorstel/smileyapp-agenda";
import { DEMO_MINUTEN, OPEN_TIJDEN_MAX, afspraakIcs, afspraakTekst, dagEnTijd, leesMoment, openVoorSite, openzetFout, overlapt, startVanId, tijdId, tijdVerlopen, type Tijd } from "@/lib/voorstel/smileyapp-agenda-regels";
import { smileyappKennis } from "@/lib/voorstel/smileyapp-chat";
import { bewaarPosterZin, smileyappInstellingen, zetWeekmail } from "@/lib/voorstel/smileyapp-instellingen";
import { afspraakMeldingMail, bevestigingMail, weekMail } from "@/lib/voorstel/smileyapp-mail";
import { POSTER_ZIN_MAX, POSTER_ZIN_STANDAARD, leesPosterZin, posterZin } from "@/lib/voorstel/smileyapp-poster-regels";
import { TEKSTEN, veelgesteldTaal } from "@/lib/voorstel/smileyapp-talen";
import { FORMULIER_NL } from "@/lib/voorstel/smileyapp-teksten";
import {
  ANTWOORD_MAX,
  ANTWOORD_MIN,
  VRAAG_MAX,
  VRAAG_MIN,
  VRAGEN_MAX,
  beheerVragen,
  leesStaat,
  metBewerkteVraag,
  metNieuweVraag,
  metVerborgen,
  metVerplaatst,
  standaardId,
  terugNaarStandaard,
  valideerVraag,
  vertaaldeVragen,
  zichtbareVragen,
  zonderVraag,
  type VragenStaat,
} from "@/lib/voorstel/smileyapp-vraag-regels";
import { smileyappVragen, vragenVoorBeheer, wijzigVragen } from "@/lib/voorstel/smileyapp-vragen";
import { OPEN_NA_DAGEN, isVerzendMoment, telWeek, weekPeriode, weekmailSleutel } from "@/lib/voorstel/smileyapp-week-regels";
import { SMILEYAPP_WEEKMAIL_JOB, stuurVoorbeeld, stuurWeekmail, weekCijfers } from "@/lib/voorstel/smileyapp-weekmail";

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
/** donderdag 19 november 2026, 10:00 Nederlandse tijd (wintertijd) */
const NU = new Date("2026-11-19T10:00:00+01:00");
const BEHEER = "https://smileyapp.zekerflex.com/beheer";
const INVOER: AanvraagInvoer = { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", telefoon: "0612345678", toestemming: true };

async function fout(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("er kwam geen fout");
}

/** Een beheerder die kan inloggen: zo iemand krijgt de meldingen en de wekelijkse mail. */
function beheerder(email = "martijn@smileyapp.test", o: Record<string, unknown> = {}) {
  h.kv.set(`voorstel-smileyapp:account:${email}`, { email, naam: "Martijn", rol: "beheerder", wachtwoord: "hash", aangemaakt: NU.toISOString(), ...o });
}

async function aanvraag(o: Partial<Aanvraag> = {}, nu = NU): Promise<Aanvraag> {
  return maakAanvraag({ soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", ...o }, nu);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.kv.clear();
  h.mails.length = 0;
  h.weergaven = 37;
  h.chats = [];
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe("A. opvolglijst: status en notities", () => {
  it("de statussen van de opvolging, met een label voor elk", () => {
    expect([...STATUSSEN]).toEqual(["nieuw", "gebeld", "afspraak", "gehad", "klant", "afgevallen"]);
    expect(STATUSSEN.map((s) => STATUS_LABEL[s])).toEqual(["Nieuw", "Gebeld", "Demo gepland", "Demo gehad", "Klant", "Afgevallen"]);
    expect(isStatus("gehad")).toBe(true);
    expect(isStatus("onbekend")).toBe(false);
    expect(isStatus(undefined)).toBe(false);
  });

  it("overgangen: boeken zet op Demo gepland, annuleren zet alleen een geplande demo terug naar Nieuw", async () => {
    expect((await aanvraag()).status).toBe("nieuw");
    expect((await aanvraag({ afspraak: { tijd: "202611230900", start: "2026-11-23T09:00:00.000Z" } })).status).toBe("afspraak");
    expect(statusNaAnnuleren("afspraak")).toBe("nieuw");
    // wat het team daarna zelf koos, blijft staan
    for (const s of ["nieuw", "gebeld", "gehad", "klant", "afgevallen"] as const) expect(statusNaAnnuleren(s)).toBe(s);
  });

  it("een notitie: hooguit 1000 tekens, niet leeg, hooguit 30 per aanvraag", () => {
    expect(NOTITIE_TEKST_MAX).toBe(1000);
    expect(NOTITIES_MAX).toBe(30);
    const n = (tekst: string, bestaand: readonly Notitie[] = []) => metNotitie(bestaand, { id: "a1b2c3d4e5f6", tekst, door: "Sanne", op: NU.toISOString() });
    expect(n("  Belt vrijdag terug.  ")).toEqual({ ok: true, waarde: [{ id: "a1b2c3d4e5f6", tekst: "Belt vrijdag terug.", door: "Sanne", op: NU.toISOString() }] });
    expect(n("x".repeat(1000)).ok).toBe(true);
    expect(n("x".repeat(1001)).ok).toBe(false);
    expect(n("   ").ok).toBe(false);
    const dertig: Notitie[] = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`.padStart(12, "0"), tekst: "x", door: "Sanne", op: NU.toISOString() }));
    expect(n("nog een", dertig.slice(0, 29)).ok).toBe(true);
    expect(n("nog een", dertig)).toMatchObject({ ok: false });
  });

  it("bewaren: wie en wanneer staan erbij, de oudste eerst; weghalen kan; de grenzen gelden ook op de server", async () => {
    const a = await aanvraag();
    const later = new Date("2026-11-20T09:30:00+01:00");
    const b = await voegNotitieToe(a.id, "Gebeld, wil een demo.", "Sanne", later);
    const c = await voegNotitieToe(a.id, "Offerte gestuurd.", "Martijn", new Date("2026-11-21T14:00:00+01:00"));
    expect(c.notities?.map((x) => [x.tekst, x.door, x.op])).toEqual([
      ["Gebeld, wil een demo.", "Sanne", "2026-11-20T08:30:00.000Z"],
      ["Offerte gestuurd.", "Martijn", "2026-11-21T13:00:00.000Z"],
    ]);
    expect(c.behandeldDoor).toBe("Martijn");
    expect(c.status).toBe("nieuw");
    const eerste = b.notities?.[0]?.id ?? "";
    expect((await verwijderNotitie(a.id, eerste, "Martijn", later)).notities?.map((x) => x.tekst)).toEqual(["Offerte gestuurd."]);
    expect((await fout(verwijderNotitie(a.id, eerste, "Martijn", later))).status).toBe(404);
    expect((await fout(voegNotitieToe(a.id, "x".repeat(1001), "Sanne", later))).status).toBe(422);
    expect((await fout(voegNotitieToe("0000000000000000", "x", "Sanne", later))).status).toBe(404);
    // een geweigerde notitie verandert niets
    expect((await alleAanvragen(later))[0]?.notities).toHaveLength(1);
  });

  it("de route: een notitie erbij of eraf, de status wijzigen, en het scherm neemt de serverversie over", () => {
    const route = lees("app/api/voorstel/smileyapp/beheer/route.ts");
    expect(route).toContain("await voegNotitieToe(id, nieuweNotitie, ik.naam)");
    expect(route).toContain("await verwijderNotitie(id, wisNotitie, ik.naam)");
    expect(route).toContain("status: z.enum(STATUSSEN).optional()");
    // eerst de notitie: wordt die geweigerd, dan verandert de status niet mee
    expect(route.indexOf("await voegNotitieToe(")).toBeLessThan(route.indexOf("await wijzigAanvraag("));
    const scherm = lees("components/voorstel/smileyapp/beheer/Aanvragen.tsx");
    expect(scherm).toContain("bijgewerkt(aanvraag);");
    expect(scherm).toContain("maxLength={NOTITIE_TEKST_MAX}");
    // de teller per status is tegelijk het filter, en elke status heeft een eigen kleur
    expect(scherm).toContain("aria-pressed={filter === s}");
    expect(scherm).toContain("{aantal(s)}");
    const kleuren = [...scherm.matchAll(/^ {2}(nieuw|gebeld|afspraak|gehad|klant|afgevallen): "(bg-[^ "]+)/gm)].slice(0, 6).map((m) => m[2]);
    expect(new Set(kleuren).size).toBe(6);
  });
});

// ---------------------------------------------------------------------------
describe("B. agenda: tijden openzetten", () => {
  it("leest datum en begintijd als Nederlandse tijd, in de zomer en in de winter", () => {
    const winter = leesMoment("2026-12-07", "10:00", NU);
    expect(winter).toEqual({ ok: true, start: new Date("2026-12-07T09:00:00.000Z") });
    const zomer = leesMoment("2027-07-05", "10:00", NU);
    expect(zomer).toEqual({ ok: true, start: new Date("2027-07-05T08:00:00.000Z") });
  });

  it("weigert het verleden, een tijd of datum die niet bestaat, en alles wat niet op vijf minuten valt", () => {
    expect(leesMoment("2026-11-19", "09:55", NU)).toMatchObject({ ok: false, veld: "tijd" });
    expect(leesMoment("2026-11-19", "10:00", NU)).toMatchObject({ ok: false, veld: "tijd" });
    expect(leesMoment("2026-11-18", "15:00", NU)).toMatchObject({ ok: false });
    expect(leesMoment("2026-11-19", "10:05", NU).ok).toBe(true);
    expect(leesMoment("2026-11-20", "10:07", NU)).toMatchObject({ ok: false, veld: "tijd" });
    expect(leesMoment("2027-02-31", "10:00", NU)).toMatchObject({ ok: false, veld: "datum" });
    // 28 maart 2027, 02:30: de klok gaat om 02:00 naar 03:00, dat halve uur bestaat niet
    expect(leesMoment("2027-03-28", "02:30", NU)).toMatchObject({ ok: false, veld: "tijd" });
    expect(leesMoment("2028-01-10", "10:00", NU)).toMatchObject({ ok: false, veld: "datum" });
    expect(leesMoment("morgen", "10:00", NU)).toMatchObject({ ok: false, veld: "datum" });
    expect(leesMoment("2026-11-20", "10u", NU)).toMatchObject({ ok: false, veld: "tijd" });
  });

  it("toont een tijd in Nederlandse tijd, ook als de server in UTC draait", () => {
    expect(DEMO_MINUTEN).toBe(30);
    // winter: 09:00 UTC is 10:00 in Nederland; zomer: 08:00 UTC is 10:00
    expect(afspraakTekst("2026-12-07T09:00:00.000Z")).toBe("maandag 7 december om 10:00 uur");
    expect(afspraakTekst("2027-07-05T08:00:00.000Z")).toBe("maandag 5 juli om 10:00 uur");
    // vlak voor middernacht UTC is in Nederland al de volgende dag
    expect(dagEnTijd("2026-12-07T23:30:00.000Z")).toEqual({ dag: "2026-12-08", tijd: "00:30" });
    expect(afspraakInTaal("2027-07-05T08:00:00.000Z", "en")).toBe("Monday 5 July at 10:00");
    expect(afspraakInTaal("2026-12-07T09:00:00.000Z", "de")).toContain("10:00 Uhr");
    expect(afspraakInTaal("2026-12-07T09:00:00.000Z", "nl")).toBe("maandag 7 december om 10:00 uur");
  });

  it("het id is het begin in UTC; een verzonnen id is geen tijd", () => {
    const start = new Date("2026-12-07T09:00:00.000Z");
    expect(tijdId(start)).toBe("202612070900");
    expect(startVanId("202612070900")).toEqual(start);
    expect(startVanId("202613070900")).toBeNull();
    expect(startVanId("../account")).toBeNull();
  });

  it("geen overlap, geen dubbele tijd en hooguit 200 open tijden", () => {
    const t = (start: string, status: Tijd["status"] = "open"): Tijd => ({ id: tijdId(new Date(start)), start, status, door: "Sanne", aangemaakt: NU.toISOString() });
    const tien = t("2026-12-07T09:00:00.000Z");
    expect(overlapt(new Date("2026-12-07T09:15:00.000Z"), [tien])).toBe(true);
    expect(overlapt(new Date("2026-12-07T08:35:00.000Z"), [tien])).toBe(true);
    expect(overlapt(new Date("2026-12-07T09:30:00.000Z"), [tien])).toBe(false);
    expect(overlapt(new Date("2026-12-07T08:30:00.000Z"), [tien])).toBe(false);
    expect(openzetFout(new Date("2026-12-07T09:00:00.000Z"), [tien], NU)).toBe("Deze tijd staat al in de agenda.");
    expect(openzetFout(new Date("2026-12-07T09:30:00.000Z"), [tien], NU)).toBeNull();
    expect(OPEN_TIJDEN_MAX).toBe(200);
    const vol = Array.from({ length: 200 }, (_, i) => t(new Date(Date.UTC(2026, 11, 1 + Math.floor(i / 10), 8 + (i % 10))).toISOString()));
    expect(openzetFout(new Date("2027-01-15T09:00:00.000Z"), vol, NU)).toContain("200 tijden open");
    // een geboekte tijd telt niet mee voor de 200
    expect(openzetFout(new Date("2027-01-15T09:00:00.000Z"), [...vol.slice(1), t("2027-01-20T09:00:00.000Z", "geboekt")], NU)).toBeNull();
  });

  it("de site krijgt alleen het id en het begin van tijden die nog te boeken zijn, de vroegste eerst", () => {
    const t = (start: string, o: Partial<Tijd> = {}): Tijd => ({ id: tijdId(new Date(start)), start, status: "open", door: "Sanne", aangemaakt: NU.toISOString(), ...o });
    const lijst = [
      t("2026-11-24T09:00:00.000Z"),
      t("2026-11-23T09:00:00.000Z"),
      t("2026-11-25T09:00:00.000Z", { status: "geboekt", aanvraag: "a".repeat(16) }),
      // begint over een half uur: te dichtbij
      t("2026-11-19T09:30:00.000Z"),
    ];
    expect(openVoorSite(lijst, NU)).toEqual([
      { id: "202611230900", start: "2026-11-23T09:00:00.000Z" },
      { id: "202611240900", start: "2026-11-24T09:00:00.000Z" },
    ]);
    // een open tijd verdwijnt zodra hij voorbij is; een geboekte blijft dertig dagen staan
    expect(tijdVerlopen(t("2026-11-19T08:00:00.000Z"), NU)).toBe(true);
    expect(tijdVerlopen(t("2026-11-10T08:00:00.000Z", { status: "geboekt" }), NU)).toBe(false);
    expect(tijdVerlopen(t("2026-10-10T08:00:00.000Z", { status: "geboekt" }), NU)).toBe(true);
  });

  it("bewaren: openzetten, dezelfde tijd niet twee keer, weghalen", async () => {
    const t = await zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Sanne", NU);
    expect(t).toEqual({ id: "202611230900", start: "2026-11-23T09:00:00.000Z", status: "open", door: "Sanne", aangemaakt: NU.toISOString() });
    expect((await fout(zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Martijn", NU))).status).toBe(422);
    expect((await fout(zetTijdOpen({ datum: "2026-11-23", tijd: "10:15" }, "Martijn", NU))).message).toContain("overlapt");
    expect((await fout(zetTijdOpen({ datum: "2026-11-18", tijd: "10:00" }, "Martijn", NU))).status).toBe(422);
    expect(await openTijden(NU)).toEqual([{ id: "202611230900", start: "2026-11-23T09:00:00.000Z" }]);
    await haalTijdWeg(t.id);
    expect(await alleTijden(NU)).toEqual([]);
    expect((await fout(haalTijdWeg(t.id))).status).toBe(404);
  });
});

describe("B. agenda: boeken en annuleren", () => {
  it("twee mensen tegelijk: één wint, de ander krijgt niets", async () => {
    const t = await zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Sanne", NU);
    const [een, twee] = await Promise.all([boekTijd(t.id, "a".repeat(16), NU), boekTijd(t.id, "b".repeat(16), NU)]);
    expect([een, twee].filter(Boolean)).toHaveLength(1);
    const opgeslagen = (await alleTijden(NU))[0];
    expect(opgeslagen?.status).toBe("geboekt");
    expect(opgeslagen?.aanvraag).toBe(een ? "a".repeat(16) : "b".repeat(16));
    // en daarna is hij voor niemand meer te boeken, en niet meer op de site
    expect(await boekTijd(t.id, "c".repeat(16), NU)).toBeNull();
    expect(await openTijden(NU)).toEqual([]);
    // een geboekte tijd weghalen kan niet: eerst annuleren
    expect((await fout(haalTijdWeg(t.id))).message).toContain("Annuleer eerst de boeking");
    // een tijd die niet bestaat of te dichtbij is
    expect(await boekTijd("202612010900", "a".repeat(16), NU)).toBeNull();
    const straks = await zetTijdOpen({ datum: "2026-11-19", tijd: "10:30" }, "Sanne", NU);
    expect(await boekTijd(straks.id, "a".repeat(16), NU)).toBeNull();
  });

  it("annuleren: de tijd komt weer vrij, de afspraak gaat van de aanvraag af en er staat bij wie het deed", async () => {
    const t = await zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Sanne", NU);
    const a = await aanvraag();
    const geboekt = await boekTijd(t.id, a.id, NU);
    expect(geboekt?.status).toBe("geboekt");
    h.kv.set(`voorstel-smileyapp:aanvraag:${a.id}`, { ...a, status: "afspraak", afspraak: { tijd: t.id, start: t.start } });
    // het beheer ziet wie boekte; de site niet
    expect((await agendaVoorBeheer(NU))[0]?.boeker).toEqual({ naam: "Jan Jansen", bedrijf: "Bakkerij Jansen" });

    const later = new Date("2026-11-20T09:00:00+01:00");
    await annuleerBoeking(t.id, "Martijn", later);
    expect(await openTijden(later)).toEqual([{ id: t.id, start: t.start }]);
    const na = (await alleAanvragen(later))[0];
    expect(na?.afspraak).toBeUndefined();
    expect(na?.status).toBe("nieuw");
    expect(na?.notities?.[0]).toMatchObject({ tekst: "Demo-afspraak van maandag 23 november om 10:00 uur geannuleerd.", door: "Martijn", op: later.toISOString() });
    expect((await fout(annuleerBoeking(t.id, "Martijn", later))).message).toBe("Deze tijd is niet geboekt.");
  });

  it("het agendabestand: begin en eind in UTC met Z, dertig minuten, regels met CRLF", () => {
    const ics = afspraakIcs({ uid: "demo-202707050800@smileyapp.zekerflex.com", start: "2027-07-05T08:00:00.000Z", nu: NU, titel: "Demo Smileyapp", omschrijving: "Kun je toch niet? Mail naar info@smileyapp.nl." });
    const regels = ics.split("\r\n");
    expect(regels[0]).toBe("BEGIN:VCALENDAR");
    expect(regels).toContain("DTSTART:20270705T080000Z");
    expect(regels).toContain("DTEND:20270705T083000Z");
    expect(regels).toContain("DTSTAMP:20261119T090000Z");
    expect(regels).toContain("SUMMARY:Demo Smileyapp");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // nooit een lokale tijd of een tijdzone-naam: elke tijd eindigt op Z
    for (const r of regels.filter((x) => /^DT/.test(x))) expect(r).toMatch(/^DT(?:START|END|STAMP):\d{8}T\d{6}Z$/);
    expect(ics).not.toContain("TZID");
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("de mails: de beheerders zien het bedrijf en de tijd, de aanvrager krijgt de tijd in Nederlandse tijd met het bestand erbij", () => {
    const m = afspraakMeldingMail({ to: "martijn@smileyapp.test", bedrijf: "Bakkerij Jansen", beheer: BEHEER, start: "2027-07-05T08:00:00.000Z" });
    expect(m.subject).toBe("Demo gepland met Bakkerij Jansen: maandag 5 juli om 10:00 uur");
    expect(m.text).toContain(`${BEHEER}#agenda`);
    expect(m.kind).toBe("smileyapp-melding");
    expect(`${m.text}${m.html ?? ""}`).not.toMatch(/jan@|Jan Jansen|0612345678/);

    const b = bevestigingMail({ to: "jan@bakkerij.test", naam: "Jan Jansen", start: "2027-07-05T08:00:00.000Z", moment: afspraakInTaal("2027-07-05T08:00:00.000Z", "nl"), tijd: "202707050800", contact: "info@smileyapp.nl", nu: NU });
    expect(b.to).toBe("jan@bakkerij.test");
    expect(b.subject).toBe("Je demo van Smileyapp: maandag 5 juli om 10:00 uur");
    expect(b.text).toContain("maandag 5 juli om 10:00 uur (Nederlandse tijd)");
    expect(b.attachments).toHaveLength(1);
    expect(b.attachments?.[0]?.filename).toBe("smileyapp-demo.ics");
    expect(String(b.attachments?.[0]?.content)).toContain("DTSTART:20270705T080000Z");
    const en = bevestigingMail({ to: "jan@bakkerij.test", naam: "Jan", start: "2027-07-05T08:00:00.000Z", moment: afspraakInTaal("2027-07-05T08:00:00.000Z", "en"), taal: "en", tijd: "202707050800", contact: "info@smileyapp.nl", nu: NU });
    expect(en.subject).toBe("Your Smileyapp demo: Monday 5 July at 10:00");
    expect(en.text).toContain("(Dutch time)");
  });
});

describe("B. agenda: de aanvraagroute boekt atomair", () => {
  const stuur = async (body: unknown) => {
    const { POST } = await import("@/app/api/voorstel/smileyapp/aanvraag/route");
    const res = await POST(
      new Request("http://app:3000/api/voorstel/smileyapp/aanvraag", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-host": "smileyapp.zekerflex.com", origin: "https://smileyapp.zekerflex.com" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as { ok?: boolean; afspraak?: { start: string }; afspraken?: { waarde: string; label: string }[]; error?: { code?: string; message?: string; details?: { veld?: string } } } };
  };
  const goed = { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", telefoon: "0612345678", bericht: "", toestemming: true, lokveld: "" };
  const aanvragen = () => [...h.kv.entries()].filter(([k]) => k.startsWith("voorstel-smileyapp:aanvraag:")).map(([, v]) => v as Aanvraag);

  it("een gekozen tijd wordt geboekt, hangt aan de aanvraag, en beide mails gaan weg", async () => {
    beheerder();
    const t = await zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Sanne", NU);
    await zetTijdOpen({ datum: "2026-11-24", tijd: "14:00" }, "Sanne", NU);
    const r = await stuur({ ...goed, tijdId: t.id, dag: "2026-11-25", tijd: "11:00" });
    expect(r).toEqual({ status: 200, json: { ok: true, afspraak: { start: "2026-11-23T09:00:00.000Z" } } });
    const [a] = aanvragen();
    expect(a).toMatchObject({ status: "afspraak", afspraak: { tijd: t.id, start: t.start } });
    // de vaste afspraak gaat voor het voorkeursmoment
    expect(a?.voorkeur).toBeUndefined();
    expect((await alleTijden(NU)).find((x) => x.id === t.id)).toMatchObject({ status: "geboekt", aanvraag: a?.id });
    await vi.waitFor(() => expect(h.mails).toHaveLength(2));
    const melding = h.mails.find((m) => m.to === "martijn@smileyapp.test");
    expect(melding?.subject).toBe("Demo gepland met Bakkerij Jansen: maandag 23 november om 10:00 uur");
    const bevestiging = h.mails.find((m) => m.to === "jan@bakkerij.test");
    expect(bevestiging?.kind).toBe("smileyapp-afspraak");
    expect(bevestiging?.text).toContain("maandag 23 november om 10:00 uur");
    expect(String(bevestiging?.attachments?.[0]?.content)).toContain("DTSTART:20261123T090000Z");
  });

  it("een ander was net eerder: 409 met de lijst van nu, niets bewaard, niets gemaild en geen namen", async () => {
    beheerder();
    const t = await zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Sanne", NU);
    await zetTijdOpen({ datum: "2026-11-24", tijd: "14:00" }, "Sanne", NU);
    expect((await stuur({ ...goed, tijdId: t.id })).status).toBe(200);
    await vi.waitFor(() => expect(h.mails).toHaveLength(2));
    const r = await stuur({ ...goed, naam: "Piet Pietersen", email: "piet@slager.test", tijdId: t.id });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatchObject({ code: "TIJD_BEZET", details: { veld: "tijdId" } });
    expect(r.json.afspraken).toEqual([{ waarde: "202611241300", label: "dinsdag 24 november om 14:00 uur" }]);
    expect(JSON.stringify(r.json)).not.toMatch(/Jan|Jansen|bakkerij|Sanne/);
    expect(aanvragen()).toHaveLength(1);
    expect(h.mails).toHaveLength(2);
  });

  it("zonder gekozen tijd blijft alles zoals het was: het voorkeursmoment, status Nieuw, alleen de melding", async () => {
    beheerder();
    const r = await stuur({ ...goed, dag: "2026-11-23", tijd: "10:30" });
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(aanvragen()[0]).toMatchObject({ status: "nieuw", voorkeur: { dag: "2026-11-23", tijd: "10:30" } });
    await vi.waitFor(() => expect(h.mails).toHaveLength(1));
    expect(h.mails[0]?.subject).toBe("Nieuwe demo-aanvraag van Bakkerij Jansen");
  });

  it("de regels: een tijd-id dat niet klopt wordt geweigerd, en bij een gekozen tijd is het telefoonnummer nodig", () => {
    expect(valideerAanvraag({ ...INVOER, tijdId: "morgen" }, NU)).toMatchObject({ ok: false, veld: "tijdId" });
    expect(valideerAanvraag({ ...INVOER, telefoon: "", tijdId: "202611230900" }, NU)).toMatchObject({ ok: false, veld: "telefoon" });
    expect(valideerAanvraag({ ...INVOER, tijdId: "202611230900" }, NU)).toMatchObject({ ok: true, tijdId: "202611230900" });
    expect(valideerAanvraag(INVOER, NU)).toMatchObject({ ok: true });
    expect(valideerAanvraag(INVOER, NU)).not.toHaveProperty("tijdId");
  });

  it("de keuzelijst voor het formulier, per taal, en de teksten staan in alle talen", async () => {
    await zetTijdOpen({ datum: "2026-11-23", tijd: "10:00" }, "Sanne", NU);
    expect(await afsprakenVoorSite("nl", NU)).toEqual([{ waarde: "202611230900", label: "maandag 23 november om 10:00 uur" }]);
    expect((await afsprakenVoorSite("en", NU))[0]?.label).toBe("Monday 23 November at 10:00");
    for (const sleutel of ["afspraak", "afspraakGeen", "afspraakUitleg", "bedanktAfspraak"] as const) {
      expect(FORMULIER_NL[sleutel].length).toBeGreaterThan(5);
      expect(TEKSTEN.en.formulier[sleutel].length).toBeGreaterThan(5);
      expect(TEKSTEN.de.formulier[sleutel].length).toBeGreaterThan(5);
    }
    expect(TEKSTEN.en.formulier.fouten.tijdId).toBeTruthy();
    expect(TEKSTEN.de.formulier.fouten.tijdId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("C. veelgestelde vragen zelf beheren", () => {
  const STD = veelgesteld();
  const id = (n: number) => standaardId(STD[n]?.vraag ?? "");
  const moet = (u: ReturnType<typeof metVerborgen>): VragenStaat | null => {
    if (!u.ok) throw new Error(u.fout);
    return u.staat;
  };

  it("de standaard is exact de huidige vragen, en elke standaardvraag past binnen de grenzen", async () => {
    expect(zichtbareVragen(STD, null)).toEqual(STD);
    expect(await smileyappVragen(STD)).toEqual(STD);
    expect(beheerVragen(STD, null).map((v) => [v.vraag, v.antwoord, v.verborgen, v.soort])).toEqual(STD.map((v) => [v.vraag, v.antwoord, false, "standaard"]));
    expect(STD.length).toBeGreaterThan(5);
    for (const v of STD) expect(valideerVraag(v), v.vraag).toEqual({ ok: true, waarde: v });
    expect(new Set(STD.map((v) => standaardId(v.vraag))).size).toBe(STD.length);
    // de vertaalde lijsten lopen gelijk op met de Nederlandse
    expect(veelgesteldTaal(PAKKETTEN, "en")).toHaveLength(STD.length);
  });

  it("de grenzen: vraag 10 tot 200 tekens, antwoord 20 tot 1200, platte tekst, hooguit 30 vragen", () => {
    expect([VRAAG_MIN, VRAAG_MAX, ANTWOORD_MIN, ANTWOORD_MAX, VRAGEN_MAX]).toEqual([10, 200, 20, 1200, 30]);
    const antwoord = "a".repeat(20);
    expect(valideerVraag({ vraag: "v".repeat(9), antwoord }).ok).toBe(false);
    expect(valideerVraag({ vraag: "v".repeat(10), antwoord }).ok).toBe(true);
    expect(valideerVraag({ vraag: "v".repeat(200), antwoord }).ok).toBe(true);
    expect(valideerVraag({ vraag: "v".repeat(201), antwoord })).toMatchObject({ ok: false, veld: "vraag" });
    expect(valideerVraag({ vraag: "v".repeat(10), antwoord: "a".repeat(19) })).toMatchObject({ ok: false, veld: "antwoord" });
    expect(valideerVraag({ vraag: "v".repeat(10), antwoord: "a".repeat(1200) }).ok).toBe(true);
    expect(valideerVraag({ vraag: "v".repeat(10), antwoord: "a".repeat(1201) }).ok).toBe(false);
    // regeleinden en stuurtekens worden een spatie; spaties tellen niet mee voor de minimale lengte
    expect(valideerVraag({ vraag: "  Kan ik\n\topzeggen?  ", antwoord: "Ja,   dat kan\r\nper maand opzeggen." })).toEqual({ ok: true, waarde: { vraag: "Kan ik opzeggen?", antwoord: "Ja, dat kan per maand opzeggen." } });
    expect(valideerVraag({ vraag: `${" ".repeat(20)}kort`, antwoord }).ok).toBe(false);

    let staat: VragenStaat | null = null;
    for (let n = STD.length; n < 30; n += 1) staat = moet(metNieuweVraag(STD, staat, { vraag: `Eigen vraag nummer ${n}?`, antwoord: "Een antwoord van twintig tekens of meer." }, n.toString(16).padStart(16, "0")));
    expect(beheerVragen(STD, staat)).toHaveLength(30);
    expect(metNieuweVraag(STD, staat, { vraag: "Nog een vraag erbij?", antwoord: "Een antwoord van twintig tekens of meer." }, "f".repeat(16))).toMatchObject({ ok: false });
    // dezelfde vraag twee keer kan niet
    expect(metNieuweVraag(STD, null, { vraag: STD[0]?.vraag ?? "", antwoord: "Een antwoord van twintig tekens of meer." }, "f".repeat(16))).toMatchObject({ ok: false, veld: "vraag" });
  });

  it("verbergen, volgorde, bewerken en terug naar de standaard", () => {
    // verbergen: weg van de site, nog in het beheer
    const verborgen = moet(metVerborgen(STD, null, id(1), true));
    expect(zichtbareVragen(STD, verborgen)).toEqual(STD.filter((_, n) => n !== 1));
    expect(beheerVragen(STD, verborgen)[1]).toMatchObject({ verborgen: true, soort: "standaard" });
    // weer tonen: alles is weer de standaard, dus er valt niets te bewaren
    expect(moet(metVerborgen(STD, verborgen, id(1), false))).toBeNull();

    // volgorde: de tweede naar boven; bovenaan omhoog verandert niets
    const gewisseld = moet(metVerplaatst(STD, null, id(1), "op"));
    expect(zichtbareVragen(STD, gewisseld).map((v) => v.vraag).slice(0, 3)).toEqual([STD[1]?.vraag, STD[0]?.vraag, STD[2]?.vraag]);
    expect(moet(metVerplaatst(STD, null, id(0), "op"))).toBeNull();
    expect(moet(metVerplaatst(STD, gewisseld, id(1), "neer"))).toBeNull();

    // bewerken: een eigen tekst; terug naar de standaard haalt hem weg
    const bewerkt = moet(metBewerkteVraag(STD, null, id(0), { vraag: "Hoe werkt Smileyapp precies?", antwoord: "Je scant een QR-code en swipet een smiley." }));
    expect(zichtbareVragen(STD, bewerkt)[0]).toEqual({ vraag: "Hoe werkt Smileyapp precies?", antwoord: "Je scant een QR-code en swipet een smiley." });
    expect(beheerVragen(STD, bewerkt)[0]?.soort).toBe("aangepast");
    expect(moet(terugNaarStandaard(STD, bewerkt, id(0)))).toBeNull();
    expect(moet(terugNaarStandaard(STD, bewerkt))).toBeNull();
    // letterlijk de standaardtekst invullen is ook terug naar de standaard
    expect(moet(metBewerkteVraag(STD, bewerkt, id(0), STD[0] ?? { vraag: "", antwoord: "" }))).toBeNull();

    // een eigen vraag: erbij, en weer weg; een standaardvraag kun je alleen verbergen
    const eigen = moet(metNieuweVraag(STD, null, { vraag: "Kan ik per maand opzeggen?", antwoord: "Dat hangt af van het pakket dat je kiest." }, "a".repeat(16)));
    expect(zichtbareVragen(STD, eigen).at(-1)).toEqual({ vraag: "Kan ik per maand opzeggen?", antwoord: "Dat hangt af van het pakket dat je kiest." });
    expect(beheerVragen(STD, eigen).at(-1)?.soort).toBe("eigen");
    expect(moet(zonderVraag(STD, eigen, "a".repeat(16)))).toBeNull();
    expect(zonderVraag(STD, null, id(0))).toMatchObject({ ok: false });
    expect(terugNaarStandaard(STD, eigen, "a".repeat(16))).toMatchObject({ ok: false });
    expect(metVerborgen(STD, null, "std-bestaat-niet", true)).toMatchObject({ ok: false });

    // de laatste zichtbare vraag kan niet weg: het blok op de site is nooit leeg
    let staat: VragenStaat | null = null;
    for (let n = 0; n < STD.length - 1; n += 1) staat = moet(metVerborgen(STD, staat, id(n), true));
    expect(zichtbareVragen(STD, staat)).toHaveLength(1);
    expect(metVerborgen(STD, staat, id(STD.length - 1), true)).toMatchObject({ ok: false, fout: "Er moet minstens één vraag zichtbaar blijven op de site." });
  });

  it("een standaardvraag die het team niet aanraakte, blijft de prijzen volgen; een eigen tekst niet", () => {
    const duurder = PAKKETTEN.map((p, n) => (n === 0 && p.prijs !== null ? { ...p, prijs: p.prijs + 10 } : p));
    const nieuw = veelgesteld(duurder);
    const kostNu = nieuw.find((v) => v.vraag === "Wat kost Smileyapp?")?.antwoord ?? "";
    expect(kostNu).not.toBe(STD.find((v) => v.vraag === "Wat kost Smileyapp?")?.antwoord);
    // alleen de volgorde is aangepast: het antwoord komt bij elk lezen uit de standaard van nu
    const staat = moet(metVerplaatst(STD, null, id(1), "op"));
    expect(zichtbareVragen(nieuw, staat)[0]).toEqual({ vraag: "Wat kost Smileyapp?", antwoord: kostNu });
    // een nieuwe standaardvraag in de code komt achteraan; een verdwenen standaardvraag valt weg
    expect(zichtbareVragen([...STD, { vraag: "Een nieuwe vraag in de code?", antwoord: "Met een antwoord dat klopt." }], staat).at(-1)?.vraag).toBe("Een nieuwe vraag in de code?");
    expect(zichtbareVragen(STD.slice(1), staat).map((v) => v.vraag)).toEqual(STD.slice(1).map((v) => v.vraag));
    // een kapotte opslag is "geen wijzigingen"
    expect(leesStaat({ items: "kapot" })).toBeNull();
    expect(leesStaat(null)).toBeNull();
    expect(zichtbareVragen(STD, leesStaat({ items: [{ id: "<script>", vraag: "x", antwoord: "y" }, 42, null] }))).toEqual(STD);
  });

  it("de vertaalde pagina's volgen volgorde en verbergen; zonder vertaling staat een vraag er niet", () => {
    const en = veelgesteldTaal(PAKKETTEN, "en");
    expect(vertaaldeVragen(en, STD, null)).toEqual(en);
    const staat = moet(metVerborgen(STD, moet(metVerplaatst(STD, null, id(1), "op")), id(2), true));
    expect(vertaaldeVragen(en, STD, staat)).toEqual([en[1], en[0], ...en.slice(3)]);
    const metEigen = moet(metNieuweVraag(STD, moet(metBewerkteVraag(STD, null, id(0), { vraag: "Hoe werkt Smileyapp precies?", antwoord: "Je scant een QR-code en swipet een smiley." })), { vraag: "Kan ik per maand opzeggen?", antwoord: "Dat hangt af van het pakket dat je kiest." }, "a".repeat(16)));
    expect(vertaaldeVragen(en, STD, metEigen)).toEqual(en.slice(1));
  });

  it("bewaren: de site en de chat lezen dezelfde lijst; terug naar de standaard ruimt de opslag op", async () => {
    const SLEUTEL = "voorstel-smileyapp:vragen";
    const na = await wijzigVragen({ soort: "bewaren", vraag: "Kan ik per maand opzeggen?", antwoord: "Dat hangt af van het pakket dat je kiest." });
    expect(na.aangepast).toBe(true);
    expect(na.vragen.at(-1)).toMatchObject({ vraag: "Kan ik per maand opzeggen?", soort: "eigen", verborgen: false });
    expect(h.kv.has(SLEUTEL)).toBe(true);
    await wijzigVragen({ soort: "verbergen", id: id(0), verborgen: true });

    const site = await smileyappVragen(STD);
    expect(site.map((v) => v.vraag)).toEqual([...STD.slice(1).map((v) => v.vraag), "Kan ik per maand opzeggen?"]);
    // de chat krijgt precies die lijst
    const fragmenten = smileyappKennis({ vragen: site }).fragmenten.filter((f) => f.titel.startsWith("Vraag: "));
    expect(fragmenten.map((f) => [f.titel, f.tekst])).toEqual(site.map((v) => [`Vraag: ${v.vraag}`, v.antwoord]));
    // zonder `vragen` de standaard, zoals het was
    expect(smileyappKennis().fragmenten.filter((f) => f.titel.startsWith("Vraag: "))).toHaveLength(STD.length);

    expect((await fout(wijzigVragen({ soort: "bewaren", vraag: "kort", antwoord: "ook kort" }))).status).toBe(422);
    expect((await fout(wijzigVragen({ soort: "verbergen", id: "../account", verborgen: true }))).status).toBe(404);
    const terug = await wijzigVragen({ soort: "standaard" });
    expect(terug).toEqual({ vragen: (await vragenVoorBeheer()).vragen, aangepast: false });
    expect(h.kv.has(SLEUTEL)).toBe(false);
    expect(await smileyappVragen(STD)).toEqual(STD);
  });
});

// ---------------------------------------------------------------------------
describe("D. wekelijkse mail aan de beheerders", () => {
  /** maandag 23 november 2026, 07:00 Nederlandse tijd (wintertijd: 06:00 UTC) */
  const MAANDAG = new Date("2026-11-23T07:00:00+01:00");

  it("de periode: de zeven hele Nederlandse dagen vóór vandaag, in de winter en in de zomer", () => {
    const p = weekPeriode(MAANDAG);
    expect(p.sleutel).toBe("2026-11-23");
    expect(p.van.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(p.tot.toISOString()).toBe("2026-11-22T23:00:00.000Z");
    expect(p.dagen).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const zomer = weekPeriode(new Date("2027-07-05T07:00:00+02:00"));
    expect(zomer.van.toISOString()).toBe("2027-06-27T22:00:00.000Z");
    expect(zomer.tot.toISOString()).toBe("2027-07-04T22:00:00.000Z");
    expect(zomer.dagen[0]).toBe("2027-06-28");
    // de week waarin de klok verspringt telt 167 of 169 uur, maar blijft zeven dagen
    const wissel = weekPeriode(new Date("2027-03-29T07:00:00+02:00"));
    expect(wissel.dagen).toHaveLength(7);
    expect((wissel.tot.getTime() - wissel.van.getTime()) / 3_600_000).toBe(167);
    expect(weekmailSleutel(p)).toBe("voorstel-smileyapp:weekmail:2026-11-23");
  });

  it("het moment: maandag vanaf 07:00 Nederlandse tijd, wat de cron in UTC ook doet", () => {
    expect(isVerzendMoment(new Date("2026-11-23T06:59:00+01:00"))).toBe(false);
    expect(isVerzendMoment(new Date("2026-11-23T06:00:00Z"))).toBe(true);
    // zomertijd: 05:00 UTC is 07:00 in Nederland
    expect(isVerzendMoment(new Date("2027-07-05T04:59:00Z"))).toBe(false);
    expect(isVerzendMoment(new Date("2027-07-05T05:00:00Z"))).toBe(true);
    expect(isVerzendMoment(new Date("2026-11-24T08:00:00+01:00"))).toBe(false);
    expect(isVerzendMoment(new Date("2026-11-22T23:30:00Z"))).toBe(false);
  });

  it("telt alleen wat er echt is", async () => {
    const a = (o: Partial<Aanvraag>, moment: string) => aanvraag(o, new Date(moment));
    await a({}, "2026-11-16T00:30:00+01:00");
    await a({ afspraak: { tijd: "202611250900", start: "2026-11-25T09:00:00.000Z" } }, "2026-11-18T12:00:00+01:00");
    await a({ soort: "partner" }, "2026-11-22T23:59:00+01:00");
    // buiten de periode: te vroeg, en vandaag
    await a({}, "2026-11-15T23:59:00+01:00");
    await a({}, "2026-11-23T00:10:00+01:00");
    h.chats = [{ gestart: "2026-11-17T10:00:00.000Z" }, { gestart: "2026-11-10T10:00:00.000Z" }];
    const w = await weekCijfers(MAANDAG);
    expect(w).toEqual({ van: "2026-11-16", totEnMet: "2026-11-22", bezoeken: 37, aanvragen: { demo: 2, partner: 1 }, chats: 1, demos: 1, open: 2 });
    // openstaand: status Nieuw en ouder dan twee dagen (de aanvraag van vandaag en die van gisteravond nog niet)
    expect(OPEN_NA_DAGEN).toBe(2);
    // een teller die niet te lezen is, wordt geen nul
    h.weergaven = null;
    expect((await weekCijfers(MAANDAG)).bezoeken).toBeNull();
    const periode = weekPeriode(MAANDAG);
    expect(telWeek({ periode, nu: MAANDAG, aanvragen: [], chatStarts: null, bezoeken: null })).toEqual({ van: "2026-11-16", totEnMet: "2026-11-22", bezoeken: null, aanvragen: { demo: 0, partner: 0 }, chats: null, demos: 0, open: 0 });
  });

  it("de mail: alleen aantallen en een link naar het beheer, geen persoonsgegevens", async () => {
    await aanvraag({ naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", telefoon: "0612345678", bericht: "Graag bellen." }, new Date("2026-11-17T10:00:00+01:00"));
    const m = weekMail({ to: "martijn@smileyapp.test", week: await weekCijfers(MAANDAG), beheer: BEHEER });
    expect(m.kind).toBe("smileyapp-weekmail");
    expect(m.subject).toBe("SmileyApp, het overzicht van de week (maandag 16 november tot en met zondag 22 november)");
    expect(m.text).toContain("Paginaweergaven: 37");
    expect(m.text).toContain("Nieuwe demo-aanvragen: 1");
    expect(m.text).toContain("Nieuwe partner-aanmeldingen: 0");
    expect(m.text).toContain("Er staat 1 aanvraag langer dan 2 dagen op Nieuw.");
    expect(m.text).toContain(BEHEER);
    const alles = `${m.subject}${m.text}${m.html ?? ""}`;
    expect(alles).not.toMatch(/Jan|Jansen|Bakkerij|bakkerij\.test|0612345678|Graag bellen/);
    expect(weekMail({ to: "x@x.test", week: { van: "2026-11-16", totEnMet: "2026-11-22", bezoeken: null, aanvragen: { demo: 0, partner: 0 }, chats: null, demos: 0, open: 0 }, beheer: BEHEER }).text).toContain("Paginaweergaven: niet te tellen");
  });

  it("verstuurt één keer per week, alleen op het moment, en nooit zonder beheerder", async () => {
    // geen beheerder met een account: niets, en ook geen merk (zodra er wel een is, kan het nog)
    expect(await stuurWeekmail(MAANDAG)).toEqual({ verstuurd: 0, reden: "geen-beheerder" });
    beheerder("uitgenodigd@smileyapp.test", { wachtwoord: undefined });
    beheerder("weg@smileyapp.test", { geblokkeerd: true });
    h.kv.set("voorstel-smileyapp:account:sanne@smileyapp.test", { email: "sanne@smileyapp.test", naam: "Sanne", rol: "medewerker", wachtwoord: "hash", aangemaakt: NU.toISOString() });
    expect(await stuurWeekmail(MAANDAG)).toEqual({ verstuurd: 0, reden: "geen-beheerder" });
    expect(h.mails).toHaveLength(0);
    expect([...h.kv.keys()].filter((k) => k.startsWith("voorstel-smileyapp:weekmail:"))).toEqual([]);

    beheerder();
    // te vroeg (de cron van 05:00 UTC in de winter) en een andere dag: niets
    expect(await stuurWeekmail(new Date("2026-11-23T05:00:00Z"))).toEqual({ verstuurd: 0, reden: "te-vroeg" });
    expect(await stuurWeekmail(new Date("2026-11-24T06:00:00Z"))).toEqual({ verstuurd: 0, reden: "te-vroeg" });
    expect(h.mails).toHaveLength(0);

    // het merk van een eerdere week staat er nog
    h.kv.set("voorstel-smileyapp:weekmail:2026-11-16", { op: "2026-11-16T06:00:00.000Z" });
    expect(await stuurWeekmail(MAANDAG)).toEqual({ verstuurd: 1 });
    expect(h.mails.map((m) => m.to)).toEqual(["martijn@smileyapp.test"]);
    expect(h.mails[0]?.text).toContain(BEHEER);
    // de volgende ronde van de cron, een uur later: niet nog een keer
    expect(await stuurWeekmail(new Date("2026-11-23T07:00:00Z"))).toEqual({ verstuurd: 0, reden: "al-verstuurd" });
    expect(h.mails).toHaveLength(1);
    expect([...h.kv.keys()].filter((k) => k.startsWith("voorstel-smileyapp:weekmail:"))).toEqual(["voorstel-smileyapp:weekmail:2026-11-23"]);
    // de week erna weer wel
    expect(await stuurWeekmail(new Date("2026-11-30T06:00:00Z"))).toEqual({ verstuurd: 1 });
  });

  it("de schakelaar: standaard aan; uit is uit; een voorbeeld gaat alleen naar het gevraagde adres", async () => {
    beheerder();
    beheerder("tweede@smileyapp.test");
    expect((await smileyappInstellingen()).weekmail).toBe(true);
    expect((await zetWeekmail(false)).weekmail).toBe(false);
    expect(await stuurWeekmail(MAANDAG)).toEqual({ verstuurd: 0, reden: "uit" });
    expect(h.mails).toHaveLength(0);
    // het voorbeeld: één mail, naar één adres, met "Voorbeeld" erbij
    expect(await stuurVoorbeeld("martijn@smileyapp.test", BEHEER, NU)).toBe(true);
    expect(h.mails.map((m) => m.to)).toEqual(["martijn@smileyapp.test"]);
    expect(h.mails[0]?.subject.startsWith("Voorbeeld: ")).toBe(true);
    h.mails.length = 0;
    expect((await zetWeekmail(true)).weekmail).toBe(true);
    expect(await stuurWeekmail(MAANDAG)).toEqual({ verstuurd: 2 });
    // de zin op de poster staat in dezelfde rij en blijft bij het omzetten bewaard
    await bewaarPosterZin("Scan en vertel het ons");
    expect(await zetWeekmail(false)).toEqual({ weekmail: false, posterZin: "Scan en vertel het ons" });
  });

  it("de interne route, de cron en de hartslag", () => {
    const route = lees("app/api/internal/smileyapp/weekmail/route.ts");
    // eerst het interne geheim, dan pas werk
    expect(route.indexOf("checkInternalToken(request)")).toBeGreaterThan(0);
    expect(route.indexOf("if (!gate.ok) return")).toBeLessThan(route.indexOf("await stuurWeekmail("));
    expect(route).toContain("await recordCronHeartbeat(SMILEYAPP_WEEKMAIL_JOB, true)");
    expect(route).toContain("await recordCronHeartbeat(SMILEYAPP_WEEKMAIL_JOB, false)");
    // in de log alleen aantallen
    expect(route).not.toMatch(/ontvangers|email|\bto\b/);
    expect(SMILEYAPP_WEEKMAIL_JOB).toBe("smileyapp-weekmail");
    const bewaakt = WATCHED_CRONS.find((c) => c.job === SMILEYAPP_WEEKMAIL_JOB);
    // de cron komt elke ochtend langs (de route verstuurt alleen op maandag), dus de hartslag is dagelijks
    expect(bewaakt?.maxAgeHours).toBe(26);
    expect(bewaakt?.sinds).toBeTruthy();
    const cron = lees("deploy/cron/entrypoint.sh");
    // 05:00, 06:00 en 07:00 UTC: 07:00 Nederlandse tijd in de zomer én de winter, plus een herkansing; alleen het pad in de regel
    expect(cron).toContain('0 5,6,7 * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/smileyapp/weekmail"');
    expect(lees("lib/auth/public-routes.ts")).toContain('"/api/internal"');
    // het voorbeeld: alleen een beheerder, alleen naar het eigen adres, met een limiet
    const inhoud = lees("app/api/voorstel/smileyapp/beheer/inhoud/route.ts");
    expect(inhoud).toMatch(/name: "smileyapp-weekmail-voorbeeld", identifier: ik\.id, limit: 3, windowSeconds: 3600/);
    expect(inhoud).toContain("await stuurVoorbeeld(ik.email, beheerVan(request))");
    expect(inhoud.indexOf('name: "smileyapp-weekmail-voorbeeld"')).toBeLessThan(inhoud.indexOf("await stuurVoorbeeld("));
  });
});

// ---------------------------------------------------------------------------
describe("E. poster om te printen", () => {
  it("de zin: hooguit 80 tekens, één regel, leeg is de neutrale standaard", async () => {
    expect(POSTER_ZIN_MAX).toBe(80);
    expect(POSTER_ZIN_STANDAARD).toBe("Vertel ons wat je ervan vindt");
    expect(leesPosterZin("x".repeat(80))).toEqual({ ok: true, waarde: "x".repeat(80) });
    expect(leesPosterZin("x".repeat(81))).toMatchObject({ ok: false });
    expect(leesPosterZin("   ")).toEqual({ ok: true, waarde: POSTER_ZIN_STANDAARD });
    expect(leesPosterZin("Hoe was\n je  bezoek?")).toEqual({ ok: true, waarde: "Hoe was je bezoek?" });
    expect(leesPosterZin(42)).toMatchObject({ ok: false });
    expect(posterZin(undefined)).toBe(POSTER_ZIN_STANDAARD);
    expect(posterZin("x".repeat(200))).toBe(POSTER_ZIN_STANDAARD);
    // bewaren
    expect((await smileyappInstellingen()).posterZin).toBe(POSTER_ZIN_STANDAARD);
    expect((await bewaarPosterZin("  Hoe was je bezoek?  ")).posterZin).toBe("Hoe was je bezoek?");
    expect((await fout(bewaarPosterZin("x".repeat(81)))).status).toBe(422);
    expect((await smileyappInstellingen()).posterZin).toBe("Hoe was je bezoek?");
  });

  it("alleen HTML en CSS: @page voor A4 en A5, een knop die print, en niets van buiten", () => {
    const poster = lees("components/voorstel/smileyapp/beheer/Poster.tsx");
    const qr = lees("components/voorstel/smileyapp/beheer/QrCode.tsx");
    const css = lees("app/voorstel/smileyapp/smiley.css");
    expect(css).toContain("@page smposter-a4 { size: A4 portrait; margin: 0; }");
    expect(css).toContain("@page smposter-a5 { size: A5 portrait; margin: 0; }");
    expect(poster).toContain("sm-print-poster-${formaat}");
    expect(qr).toContain("window.print();");
    expect(qr).toContain('<Poster adres={adres} pad={pad} zijde={zijde} drukAf={druk === "poster"} print={() => print("poster")} />');
    // geen adres van buiten, geen script, geen PDF-bibliotheek; het logo komt uit de eigen map
    for (const s of [poster, lees("lib/voorstel/smileyapp-poster-regels.ts")]) {
      expect(s).not.toMatch(/https?:\/\//);
      expect(s).not.toMatch(/<script|jspdf|pdfkit|pdf-lib|react-pdf|html2canvas/i);
    }
    expect(poster).toContain('src={beeld("logo.webp")}');
    // de link in de QR-code blijft die van de bestaande QR-route: de poster krijgt hem van het scherm, dat leesBron gebruikt
    expect(qr).toContain("const { adres, pad, zijde } = demoQr(bron);");
    expect(qr).toContain("const bron = leesBron(invoer);");
    expect(poster).not.toMatch(/qrEncode|demoQr\(/);
    // er komt maar één van de twee op het papier
    expect(qr).toContain('druk === "kaart" ? "sm-print-kaart" : "sm-niet-printen"');
    expect(poster).toContain('drukAf ? `sm-print-poster sm-print-poster-${formaat}` : "sm-niet-printen"');
  });
});

// ---------------------------------------------------------------------------
describe("bronbewakers deel 6a", () => {
  const routes = (map: string): string[] =>
    readdirSync(path.join(ROOT, map)).flatMap((naam) => {
      const rel = `${map}/${naam}`;
      return statSync(path.join(ROOT, rel)).isDirectory() ? routes(rel) : naam === "route.ts" ? [rel] : [];
    });
  const handlers = (s: string) => s.split(/\nexport async function /).slice(1);
  const AGENDA = "app/api/voorstel/smileyapp/beheer/agenda/route.ts";
  const NIEUW_ONDERDEEL = ["Agenda.tsx", "VragenBeheer.tsx", "Weekmail.tsx", "Poster.tsx"].map((n) => `components/voorstel/smileyapp/beheer/${n}`);
  const NIEUW_LIB = ["agenda-regels", "agenda", "vraag-regels", "vragen", "week-regels", "weekmail", "poster-regels", "instellingen"].map((n) => `lib/voorstel/smileyapp-${n}.ts`);

  it("de nieuwe beheerroute: herkomst en limiet (de poort), dan de sessie, dan pas de body", () => {
    expect(routes("app/api/voorstel/smileyapp")).toContain(AGENDA);
    const s = lees(AGENDA);
    expect(s).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob)\(/);
    expect(s).not.toContain("AppError.forbidden");
    const lijst = handlers(s);
    expect(lijst.map((x) => x.slice(0, x.indexOf("(")))).toEqual(["GET", "POST"]);
    for (const hnd of lijst) {
      const poort = hnd.indexOf("await smileyPoort(request");
      const sessie = hnd.indexOf("await eisToegang()");
      expect(poort).toBeGreaterThanOrEqual(0);
      expect(sessie).toBeGreaterThan(poort);
      const body = hnd.indexOf("await jsonBegrensd(");
      if (body >= 0) expect(sessie).toBeLessThan(body);
      expect(hnd.slice(0, sessie)).not.toMatch(/agendaVoorBeheer|zetTijdOpen|annuleerBoeking|haalTijdWeg/);
    }
    expect(s).toMatch(/name: "smileyapp-agenda", identifier: ik\.id, limit: 300, windowSeconds: 3600/);
    // de poort zelf: herkomst en limiet per IP (lib/voorstel/smileyapp-poort.ts)
    const poort = lees("lib/voorstel/smileyapp-poort.ts");
    expect(poort.indexOf("zelfdeHerkomst(")).toBeLessThan(poort.indexOf("await enforceRateLimit"));
  });

  it("elke nieuwe route onder het voorstel of onder internal heeft de poort met een sessie, of het interne geheim", () => {
    for (const r of routes("app/api/voorstel/smileyapp").filter((x) => x.includes("/beheer/"))) {
      for (const hnd of handlers(lees(r))) expect(hnd.indexOf("await smileyPoort(request"), r).toBeGreaterThanOrEqual(0);
    }
    const intern = routes("app/api/internal/smileyapp");
    expect(intern).toEqual(["app/api/internal/smileyapp/weekmail/route.ts"]);
    for (const r of intern) expect(lees(r), r).toContain("const gate = checkInternalToken(request);");
  });

  it("de veelgestelde vragen en de wekelijkse mail wijzigt alleen een beheerder; een medewerker leest", () => {
    const inhoud = lees("app/api/voorstel/smileyapp/beheer/inhoud/route.ts");
    const post = handlers(inhoud).find((x) => x.startsWith("POST(")) ?? "";
    const poort = post.indexOf('throw AppError.alleenBeheerder("Alleen een beheerder kan de veelgestelde vragen wijzigen.")');
    expect(poort).toBeGreaterThan(0);
    expect(poort).toBeLessThan(post.indexOf("await wijzigVragen("));
    expect(post.indexOf('throw AppError.alleenBeheerder("Alleen een beheerder kan de wekelijkse mail aan- of uitzetten.")')).toBeLessThan(post.indexOf("await zetWeekmail("));
    // lezen mag het hele team
    const get = handlers(inhoud).find((x) => x.startsWith("GET(")) ?? "";
    expect(get).toContain('if (deel === "vragen") return NextResponse.json(await vragenVoorBeheer(), geenCache);');
    expect(get).not.toContain("alleenBeheerder");
    expect(lees("components/voorstel/smileyapp/beheer/VragenBeheer.tsx")).toContain('const magWijzigen = rol === "beheerder";');
  });

  it("één bron: de vragen op de site en de kennis van de chat komen uit smileyappVragen", () => {
    const home = lees("app/voorstel/smileyapp/page.tsx");
    expect(home).toContain("const zichtbareVragen = await smileyappVragen(vragen);");
    expect(home).toContain("{zichtbareVragen.map((v) => (");
    expect(home).not.toContain("{vragen.map(");
    const chat = lees("app/api/voorstel/smileyapp/chat/route.ts");
    expect(chat).toContain("vragen: await smileyappVragen(veelgesteld(pakketten))");
    expect(lees("lib/voorstel/smileyapp-chat.ts")).toContain("(o.vragen ?? veelgesteld(lijst)).map(");
    // de vertaalde pagina's volgen dezelfde opslag
    for (const taal of ["en", "de"]) expect(lees(`app/voorstel/smileyapp/${taal}/page.tsx`), taal).toContain("<LandingTaal taal={TAAL} pakketten={pakketten} vragenKeuze={vragenKeuze} />");
    expect(lees("components/voorstel/smileyapp/taal/Landing.tsx")).toContain("const zichtbareVragen = vertaaldeVragen(vragen, veelgesteld(pakketten), vragenKeuze);");
    // lukt het lezen niet, dan geldt de standaard
    expect(lees("lib/voorstel/smileyapp-vragen.ts")).toContain("zichtbareVragen(standaard, await vragenStaat().catch(() => null))");
  });

  it("de demopagina's geven de open tijden door, en zonder open tijd is het voorkeursmoment er zoals het was", () => {
    expect(lees("app/voorstel/smileyapp/demo/page.tsx")).toContain('afsprakenVoorSite("nl")');
    for (const taal of ["en", "de"]) expect(lees(`app/voorstel/smileyapp/${taal}/demo/page.tsx`), taal).toContain("afsprakenVoorSite(TAAL)");
    const formulier = lees("components/voorstel/smileyapp/AanvraagFormulier.tsx");
    expect(formulier).toContain("{open.length > 0 && (");
    expect(formulier).toContain('{soort === "demo" && !tijdId && (');
    expect(formulier).toContain("...(tijdId ? { tijdId } : { dag, tijd })");
    // de lijst van de server overnemen als een ander net eerder was
    expect(formulier).toContain("setOpen(d.afspraken);");
    // wat de site van de agenda krijgt, heeft geen naam: alleen een id en een tekst met de tijd
    expect(lees("lib/voorstel/smileyapp-agenda-regels.ts")).toMatch(/\.map\(\(t\) => \(\{ id: t\.id, start: t\.start \}\)\)/);
    const route = lees("app/api/voorstel/smileyapp/aanvraag/route.ts");
    expect(route.indexOf("await boekTijd(")).toBeGreaterThan(route.indexOf('name: "smileyapp-aanvraag"'));
    expect(route.indexOf("await boekTijd(")).toBeLessThan(route.indexOf("await maakAanvraag("));
    expect(route).toContain("{ status: 409 }");
  });

  it("de nieuwe schermen: geen kop van het eerste niveau, geen <form>, geen JSON-LD, niets van buiten, en opgeslagen onder voorstel-smileyapp:", () => {
    for (const f of [...NIEUW_ONDERDEEL, ...NIEUW_LIB, AGENDA, "app/api/internal/smileyapp/weekmail/route.ts"]) {
      const s = lees(f);
      expect(s, f).not.toMatch(/<h1[\s>]|<form[\s>]/);
      expect(s, f).not.toMatch(/application\/ld\+json|ldJson\(|canonical\(|LocalBusiness/);
      expect(s, f).not.toMatch(/(?:src|href|srcSet)=\{?["'`]https?:\/\//);
      // useEffect geeft nooit een waarde terug
      expect(s, f).not.toMatch(/useEffect\(\(\) => [a-zA-Z]/);
    }
    for (const f of NIEUW_ONDERDEEL) {
      const s = lees(f);
      expect(s.startsWith('"use client";'), f).toBe(true);
      // een client-onderdeel laadt geen opslag, mail of zod
      expect(s, f).not.toMatch(/@\/lib\/(storage|mail|prisma|redis)|from "zod"|smileyapp-(agenda|vragen|weekmail|instellingen|aanvragen|accounts)"/);
    }
    expect(lees("lib/voorstel/smileyapp-agenda.ts")).toContain('const PREFIX = "voorstel-smileyapp:agenda:";');
    expect(lees("lib/voorstel/smileyapp-vragen.ts")).toContain('const SLEUTEL = "voorstel-smileyapp:vragen";');
    expect(lees("lib/voorstel/smileyapp-instellingen.ts")).toContain('const SLEUTEL = "voorstel-smileyapp:instellingen";');
    // in een rij van de agenda staat het id van de aanvraag, geen naam of adres van de aanvrager
    expect(lees("lib/voorstel/smileyapp-agenda.ts")).toContain('const geboekt: Tijd = { ...t, status: "geboekt", aanvraag: aanvraagId, geboektOp: nu.toISOString() };');
    // de tabbladen staan in het beheer
    const beheer = lees("components/voorstel/smileyapp/beheer/SmileyBeheer.tsx");
    for (const tab of ['["agenda", "Agenda"]', '["vragen", "Vragen"]']) expect(beheer).toContain(tab);
    // de rij met tabbladen veegt: de sr-only tekst in een tab mag niet aan het afknippen ontsnappen
    expect(beheer).toMatch(/role="tablist"[^>]*className="relative flex gap-1 overflow-x-auto/);
  });
});
// Nalezing 19 nov: boeken bezet een tijd en mailt een adres dat de bezoeker zelf
// intypt en dat niet gecontroleerd is. Daarom een eigen grens en geen vrije tekst.
describe("boeken is geen kanaal voor rommel", () => {
  const route = readFileSync(path.join(process.cwd(), "app/api/voorstel/smileyapp/aanvraag/route.ts"), "utf8");

  it("heeft een eigen grens per IP en per adres, vóór het boeken", () => {
    const ip = route.indexOf('name: "smileyapp-boeking-ip"');
    const adres = route.indexOf('name: "smileyapp-boeking-adres"');
    const boeken = route.indexOf("await boekTijd(");
    expect(ip).toBeGreaterThan(-1);
    expect(adres).toBeGreaterThan(ip);
    expect(boeken).toBeGreaterThan(adres);
  });

  it("zet de naam van de bezoeker niet in de bevestiging", () => {
    for (const taal of ["nl", "en", "de"] as const) {
      const mail = bevestigingMail({ to: "klant@voorbeeld.test", naam: "Gratis geld op rommel.example", start: "2026-12-01T09:00:00.000Z", moment: "dinsdag 1 december om 10:00", taal, tijd: "202612010900", contact: "info@voorbeeld.test", nu: new Date("2026-11-19T08:00:00+01:00") });
      expect(`${mail.subject} ${mail.text} ${mail.html ?? ""}`).not.toContain("rommel.example");
    }
  });

  it("probeert de weekmail opnieuw als er bij niemand iets aankwam", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/voorstel/smileyapp-weekmail.ts"), "utf8");
    expect(bron).toMatch(/if \(verstuurd === 0\) await kvDelete\(merk\)/);
  });
});
