import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De wachtrij voor een medewerker (13 nov 2026, eigenaar: "zorg dat je in wachtrij komt en niet gelijk doorschakelt").

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  kvFout: false,
  bellen: [] as { to: string; voiceUrl: string; statusUrl: string; opnemen?: boolean | undefined; belTijd?: number | undefined }[],
  rec: {} as Record<string, unknown>,
  twilio: true,
  alerts: [] as { key: string; title: string; detail: string; url?: string }[],
  achteraf: [] as (() => unknown)[],
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (h.kvFout) throw new Error("kv weg");
    return h.kv.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/telephony/twilio", async (orig) => ({
  ...(await orig<typeof import("@/lib/telephony/twilio")>()),
  twilioConfigured: () => h.twilio,
  placeTwilioCall: async (i: { to: string; voiceUrl: string; statusUrl: string; opnemen?: boolean; belTijd?: number }) => {
    h.bellen.push(i);
    return { sid: "CA1" };
  },
}));
vi.mock("@/lib/env", async (orig) => {
  const mod = await orig<typeof import("@/lib/env")>();
  return { ...mod, env: { ...mod.env, TELEPHONY_FORWARD_NUMBER: "+31600000000", APP_BASE_URL: "https://zf.test" } };
});
vi.mock("@/lib/telephony/webhook", async (orig) => ({ ...(await orig<typeof import("@/lib/telephony/webhook")>()), signatureValid: () => true }));
vi.mock("@/lib/telephony/store", () => ({
  getCall: async (id: string) => (id === "c1" ? h.rec : null),
  patchCall: async (id: string, patch: Record<string, unknown>) => (id === "c1" ? Object.assign(h.rec, patch) : null),
  addTurn: async () => null,
}));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (a: { key: string; title: string; detail: string; url?: string }) => void h.alerts.push(a) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void h.achteraf.push(fn) }));

import { MAX_POGINGEN, MAX_WACHT_S, WACHTRIJ, aannemenTwiml, binnenKantoortijd, medewerkerTwiml, naWachtrijTwiml, naarMedewerkerTwiml, wachtTwiml } from "@/lib/telephony/wachtrij";
import { BELTIJD_S, BELT_MS, belMedewerker, medewerkerBezig, zetMedewerker } from "@/lib/telephony/wachtrij-server";
import { POST as wachtRoute } from "@/app/api/telephony/wachtrij/route";
import { POST as klaarRoute } from "@/app/api/telephony/wachtrij/klaar/route";
import { POST as medewerkerRoute } from "@/app/api/telephony/wachtrij/medewerker/route";
import { POST as terugbelRoute } from "@/app/api/telephony/terugbellen/route";

const BELLER = { base: "https://zf.test", callId: "c1", lang: "nl" as const, voice: "Polly.Laura-Neural" };
const post = (pad: string, velden: Record<string, string>) => new Request(`https://zf.test${pad}`, { method: "POST", body: new URLSearchParams(velden).toString() });

beforeEach(() => {
  h.kv.clear();
  h.kvFout = false;
  h.bellen.length = 0;
  h.twilio = true;
  h.alerts.length = 0;
  h.achteraf.length = 0;
  h.rec = { id: "c1", lang: "nl", dept: "5", fromNumber: "+31612345678", transcript: [] };
});
afterEach(() => vi.useRealTimers());

describe("kantoortijd (Amsterdam)", () => {
  it("maandag tot en met vrijdag 8 tot 20 uur, zaterdag 10 tot 16 uur, zondag niet", () => {
    expect(binnenKantoortijd(new Date("2026-11-16T08:00:00+01:00"))).toBe(true);
    expect(binnenKantoortijd(new Date("2026-11-16T07:59:00+01:00"))).toBe(false);
    expect(binnenKantoortijd(new Date("2026-11-20T19:59:00+01:00"))).toBe(true);
    expect(binnenKantoortijd(new Date("2026-11-20T20:00:00+01:00"))).toBe(false);
    expect(binnenKantoortijd(new Date("2026-11-14T10:30:00+01:00"))).toBe(true);
    expect(binnenKantoortijd(new Date("2026-11-14T16:00:00+01:00"))).toBe(false);
    expect(binnenKantoortijd(new Date("2026-11-15T12:00:00+01:00"))).toBe(false);
    // de server draait in UTC: 19:30 UTC op een vrijdag is 20:30 in Amsterdam
    expect(binnenKantoortijd(new Date("2026-11-20T19:30:00Z"))).toBe(false);
  });
});

describe("naar een medewerker", () => {
  it("binnen kantoortijd met een nummer: in de wachtrij, nooit meteen doorschakelen", () => {
    const xml = naarMedewerkerTwiml({ ...BELLER, kantoor: true, heeftNummer: true });
    expect(xml).toContain("wachtrij");
    expect(xml).toContain(`>${WACHTRIJ}</Enqueue>`);
    expect(xml).toContain('waitUrl="https://zf.test/api/telephony/wachtrij?callId=c1"');
    expect(xml).toContain('action="https://zf.test/api/telephony/wachtrij/klaar?callId=c1"');
    expect(xml).not.toContain("<Dial");
  });

  it("buiten kantoortijd of zonder nummer: meteen een terugbelverzoek", () => {
    const buiten = naarMedewerkerTwiml({ ...BELLER, kantoor: false, heeftNummer: true });
    expect(buiten).toContain("niet bereikbaar");
    expect(buiten).toContain("/api/telephony/terugbellen?callId=c1");
    expect(buiten).not.toContain("<Enqueue");
    expect(naarMedewerkerTwiml({ ...BELLER, kantoor: true, heeftNummer: false })).toContain("geen medewerker vrij");
    expect(naarMedewerkerTwiml({ ...BELLER, lang: "en", kantoor: true, heeftNummer: false })).toContain("call you back");
  });

  it("tijdens het wachten: de plek in de rij, en na de grens uit de rij", () => {
    expect(wachtTwiml({ lang: "nl", voice: "x", positie: 2, wachttijd: 0 })).toContain("nummer 2 in de wachtrij");
    expect(wachtTwiml({ lang: "nl", voice: "x", positie: 1, wachttijd: 40 })).toContain("U staat nog in de wachtrij, als nummer 1");
    expect(wachtTwiml({ lang: "nl", voice: "x", positie: 1, wachttijd: MAX_WACHT_S })).toBe("<Leave/>");
  });

  it("na de rij: verbonden of opgehangen is klaar, anders het terugbelverzoek", () => {
    expect(naWachtrijTwiml({ ...BELLER, uitslag: "bridged" })).toBe("<Hangup/>");
    expect(naWachtrijTwiml({ ...BELLER, uitslag: "hangup" })).toBe("<Hangup/>");
    expect(naWachtrijTwiml({ ...BELLER, uitslag: "leave" })).toContain("/api/telephony/terugbellen?callId=c1");
    expect(naWachtrijTwiml({ ...BELLER, uitslag: "error" })).toContain("/api/telephony/terugbellen?callId=c1");
  });

  it("de medewerker hoort wie er wacht en neemt aan met toets 1; zonder toets (voicemail) geen gesprek", () => {
    const xml = medewerkerTwiml({ base: "https://zf.test", callId: "c1", dept: "5" });
    expect(xml).toContain("een bedrijf, over account, facturen of uren");
    expect(xml).toContain("Toets 1");
    expect(xml).toContain("stap=aannemen");
    expect(medewerkerTwiml({ base: "https://zf.test", callId: "c1", dept: "constructor" })).toContain("Er wacht een beller van ZekerFlex.");
    expect(medewerkerTwiml({ base: "https://zf.test", callId: "c1", dept: "werker" })).toContain("Er wacht een beller van ZekerFlex: een werknemer.");
    expect(aannemenTwiml(true)).toContain(`<Dial><Queue>${WACHTRIJ}</Queue></Dial>`);
    expect(aannemenTwiml(false)).not.toContain("<Dial");
  });
});

describe("de telefoon van de medewerker laten overgaan", () => {
  it("één oproep tegelijk, zonder opname; na het overgaan mag het opnieuw, in gesprek niet", async () => {
    const nu = Date.parse("2026-11-16T10:00:00+01:00");
    expect(await medewerkerBezig(nu)).toBe(false);
    expect(await belMedewerker("https://zf.test", "c1", nu)).toBe(true);
    // hooguit 25 s overgaan: anders laat Twilio 60 s overgaan en kon er een tweede oproep tegelijk beginnen
    expect(h.bellen[0]).toMatchObject({ to: "+31600000000", opnemen: false, belTijd: BELTIJD_S });
    expect(BELTIJD_S * 1000).toBeLessThan(BELT_MS);
    expect(h.bellen[0]?.voiceUrl).toBe("https://zf.test/api/telephony/wachtrij/medewerker?callId=c1");
    expect(await medewerkerBezig(nu + 1000)).toBe(true);
    expect(await medewerkerBezig(nu + BELT_MS + 1)).toBe(false);
    await zetMedewerker("bezet", nu);
    expect(await medewerkerBezig(nu + BELT_MS + 1)).toBe(true);
    await zetMedewerker("vrij");
    expect(await medewerkerBezig(nu)).toBe(false);
  });

  it("zonder Twilio niets; een storing in de opslag telt als bezig (geen reeks oproepen)", async () => {
    h.twilio = false;
    expect(await belMedewerker("https://zf.test", "c1")).toBe(false);
    expect(h.bellen).toHaveLength(0);
    h.kvFout = true;
    expect(await medewerkerBezig()).toBe(true);
  });
});

describe("de routes", () => {
  it("wachten: vooraan en de medewerker vrij, dan gaat zijn telefoon over (op de achtergrond)", async () => {
    const xml = await (await wachtRoute(post("/api/telephony/wachtrij?callId=c1", { QueuePosition: "1", QueueTime: "0" }))).text();
    expect(xml).toContain("nummer 1 in de wachtrij");
    expect(h.achteraf).toHaveLength(1);
    await h.achteraf[0]?.();
    expect(h.bellen).toHaveLength(1);
    // tweede in de rij: wachten, niet nog eens bellen
    h.achteraf.length = 0;
    await wachtRoute(post("/api/telephony/wachtrij?callId=c1", { QueuePosition: "2", QueueTime: "10" }));
    expect(h.achteraf).toHaveLength(0);
  });

  it("na MAX_POGINGEN keer overgaan zonder aannemen: niet meer bellen maar uit de rij (dan het terugbelaanbod)", async () => {
    const eerst = await (await wachtRoute(post("/api/telephony/wachtrij?callId=c1", { QueuePosition: "1", QueueTime: "0" }))).text();
    expect(eerst).toContain("nummer 1 in de wachtrij");
    expect(h.rec.medewerkerPogingen).toBe(1);
    h.rec.medewerkerPogingen = MAX_POGINGEN;
    h.achteraf.length = 0;
    const daarna = await (await wachtRoute(post("/api/telephony/wachtrij?callId=c1", { QueuePosition: "1", QueueTime: "60" }))).text();
    expect(daarna).toContain("<Leave/>");
    expect(h.achteraf).toHaveLength(0);
  });

  it("de wachtrij afgelopen zonder gesprek: het terugbelverzoek", async () => {
    const xml = await (await klaarRoute(post("/api/telephony/wachtrij/klaar?callId=c1", { QueueResult: "leave" }))).text();
    expect(xml).toContain("/api/telephony/terugbellen?callId=c1");
  });

  it("de medewerker: opnemen, toets 1 en de status aan het einde", async () => {
    expect(await (await medewerkerRoute(post("/api/telephony/wachtrij/medewerker?callId=c1", {}))).text()).toContain("Toets 1");
    const aan = await (await medewerkerRoute(post("/api/telephony/wachtrij/medewerker?callId=c1&stap=aannemen", { Digits: "1" }))).text();
    expect(aan).toContain("<Queue>");
    expect(await medewerkerBezig()).toBe(true);
    const status = await medewerkerRoute(post("/api/telephony/wachtrij/medewerker?callId=c1&stap=status", { CallStatus: "completed" }));
    expect(status.status).toBe(204);
    expect(await medewerkerBezig()).toBe(false);
  });

  it("het terugbelverzoek: een melding zonder het hele nummer, en een bedankje", async () => {
    const xml = await (await terugbelRoute(post("/api/telephony/terugbellen?callId=c1", { SpeechResult: "Jan, morgen na tienen op 0612345678" }))).text();
    expect(xml).toContain("We bellen u zo snel mogelijk terug");
    expect(xml).toContain("<Hangup/>");
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]?.detail).toContain("+31…78");
    expect(h.alerts[0]?.detail).not.toContain("612345678");
    expect(h.alerts[0]?.url).toBe("/admin/beller");
  });
});
