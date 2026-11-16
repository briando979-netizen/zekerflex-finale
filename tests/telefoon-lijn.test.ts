import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { belplan, binnenTijd, nummerTekst, standaardInstellingen, weekdagVan, STANDAARD_UREN, type LijnInstellingen } from "@/lib/telephony/lijn";
import type { OptionId } from "@/lib/telephony/plans";
import { ANSWER_AT } from "@/lib/telephony/plans";
import { AANBOD } from "@/lib/marketing/aanbod";
import type { PhoneLine } from "@/lib/telephony/lines";

// Een actieve klantlijn (16 nov 2026, eigenaar: "zorg dat het wordt gemaakt"): doorschakelen binnen de openingstijden,
// keuzemenu, teamnummer, assistent (vraag en naam → terugbelverzoek), voicemail met uitgeschreven tekst, opnemen en sms.

const { kv } = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => v),
  kvFindByField: async () => [],
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mail", () => ({ sendMail: async () => ({ ok: true }) }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: async () => 0 }));
vi.mock("@/lib/notifications/localized-push", () => ({ sendLocalizedPush: async () => 0 }));
vi.mock("@/lib/asr/transcribe", () => ({ transcribeAudio: async () => ({ text: "", language: "nl", durationMs: 0 }) }));

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const o = (...ids: OptionId[]) => new Set<OptionId>(ids);
const inst = (p: Partial<LijnInstellingen> = {}): LijnInstellingen => ({ ...standaardInstellingen("Bakkerij Jansen", "+31612345678"), ...p });
const dinsdag = (tijd: string) => ({ dag: "di" as const, tijd });

describe("hoe een gesprek loopt", () => {
  it("openingstijden: van tot (niet tot en met), en tot 00:00 is tot middernacht", () => {
    expect(binnenTijd(STANDAARD_UREN, "di", "08:59")).toBe(false);
    expect(binnenTijd(STANDAARD_UREN, "di", "09:00")).toBe(true);
    expect(binnenTijd(STANDAARD_UREN, "di", "16:59")).toBe(true);
    expect(binnenTijd(STANDAARD_UREN, "di", "17:00")).toBe(false);
    expect(binnenTijd(STANDAARD_UREN, "za", "12:00")).toBe(false);
    expect(binnenTijd({ ...STANDAARD_UREN, za: { van: "18:00", tot: "00:00" } }, "za", "23:30")).toBe(true);
    expect(weekdagVan(0)).toBe("zo");
    expect(weekdagVan(1)).toBe("ma");
  });

  it("binnen de tijden doorschakelen; zonder teamnummer alleen het eerste nummer, met team tot 5 tegelijk", () => {
    const drie = inst({ doorschakelen: ["+31611111111", "+31622222222", "+31633333333"] });
    expect(belplan(o("doorschakelen", "voicemail"), false, drie, dinsdag("10:00")).bellen?.nummers).toEqual(["+31611111111"]);
    expect(belplan(o("doorschakelen", "team"), false, drie, dinsdag("10:00")).bellen?.nummers).toHaveLength(3);
    expect(belplan(o("doorschakelen"), false, drie, dinsdag("10:00")).bellen?.seconden).toBe(20);
  });

  it("buiten de tijden of zonder doorschakelen: de assistent, anders de voicemail, anders een nette melding", () => {
    expect(belplan(o("doorschakelen", "ai", "voicemail"), false, inst(), dinsdag("20:00"))).toMatchObject({ bellen: null, menu: null, terugval: "assistent" });
    expect(belplan(o("doorschakelen", "voicemail"), false, inst(), dinsdag("20:00")).terugval).toBe("voicemail");
    expect(belplan(o("doorschakelen"), false, inst(), dinsdag("20:00")).terugval).toBe("ophangen");
  });

  it("'de AI-assistent neemt eerst op': meteen de assistent, ook binnen de tijden", () => {
    expect(belplan(o("doorschakelen", "ai"), true, inst(), dinsdag("10:00"))).toMatchObject({ bellen: null, terugval: "assistent" });
  });

  it("keuzemenu binnen de tijden; opnemen alleen met de optie én de instelling", () => {
    const menu = inst({ menu: [{ toets: 1, label: "planning", naar: ["+31611111111", "+31622222222"] }] });
    const p = belplan(o("keuzemenu", "doorschakelen"), false, menu, dinsdag("10:00"));
    expect(p.menu?.[0]?.naar).toEqual(["+31611111111"]);
    expect(p.bellen).toBeNull();
    expect(belplan(o("keuzemenu"), false, menu, dinsdag("22:00")).menu).toBeNull();
    expect(belplan(o("doorschakelen"), false, inst({ opnemen: true }), dinsdag("10:00")).melding).toBe(false);
    expect(belplan(o("doorschakelen", "opnemen"), false, inst({ opnemen: true }), dinsdag("10:00")).melding).toBe(true);
  });

  it("nummers netjes tonen", () => {
    expect(nummerTekst("+31612345678")).toBe("06 12 34 56 78");
    expect(nummerTekst("+4915112345678")).toBe("+4915112345678");
  });
});

describe("TwiML", () => {
  it("doorschakelen: alle nummers tegelijk, met een vervolgstap; in de URL alleen lijn en stap", async () => {
    const { startTwiml } = await import("@/lib/telephony/lijn-twiml");
    const plan = belplan(o("doorschakelen", "team"), false, inst({ doorschakelen: ["+31611111111", "+31622222222"] }), dinsdag("10:00"));
    const x = startTwiml("lijn1", plan, inst(), "+31687654321");
    expect(x).toContain('timeout="20"');
    expect(x).toContain("<Number>+31611111111</Number><Number>+31622222222</Number>");
    expect(x).toContain("stap=na-bellen");
    expect(x).not.toContain("+31687654321</Number>");
  });

  it("voicemail neemt op met een opname-callback; de assistent luistert naar spraak", async () => {
    const { terugvalTwiml } = await import("@/lib/telephony/lijn-twiml");
    const vm = terugvalTwiml("lijn1", "Bakkerij Jansen", "voicemail");
    expect(vm).toContain("<Record ");
    expect(vm).toContain("soort=voicemail");
    expect(vm).toContain("Bakkerij Jansen");
    const as = terugvalTwiml("lijn1", "Bakkerij Jansen", "assistent");
    expect(as).toContain('input="speech"');
    expect(as).toContain("stap=vraag");
  });
});

const lijn = (p: Partial<PhoneLine> = {}): PhoneLine => ({
  id: "l1",
  scope: "persoonlijk",
  tenantId: null,
  orgName: null,
  userId: "u1",
  requesterName: "Jan",
  requesterEmail: "jan@example.test",
  selection: { kind: "mobiel097", bundle: "start", options: [] },
  answerAt: ["telefoon"],
  showOn: [],
  ownNumber: null,
  forwardTo: "+31612345678",
  region: null,
  note: null,
  quote: { lines: [], monthlyCents: 0, onRequest: false, tip: null },
  status: "actief",
  number: "+3197010000001",
  adminNote: null,
  history: [],
  createdAt: "2026-11-16T00:00:00.000Z",
  ...p,
});

describe("de server", () => {
  beforeEach(() => kv.clear());

  it("bewaren: zonder teamnummer één doorschakelnummer, zonder keuzemenu geen menu, opnemen alleen met de optie", async () => {
    const { bewaarInstellingen, instellingenSchema } = await import("@/lib/telephony/lijn-server");
    const invoer = instellingenSchema.parse({
      naam: "Jan de Vries",
      doorschakelen: ["06 11111111", "06 22222222"],
      belSeconden: 25,
      openingstijden: { ...STANDAARD_UREN },
      menu: [{ toets: 1, label: "planning", naar: ["06 33333333"] }],
      opnemen: true,
    });
    const next = await bewaarInstellingen(lijn(), invoer);
    expect(next.instellingen?.doorschakelen).toEqual(["+31611111111"]);
    expect(next.instellingen?.menu).toEqual([]);
    expect(next.instellingen?.opnemen).toBe(false);
    const compleet = await bewaarInstellingen(lijn({ selection: { kind: "mobiel097", bundle: "compleet", options: [] } }), invoer);
    expect(compleet.instellingen?.doorschakelen).toHaveLength(2);
    expect(compleet.instellingen?.menu).toHaveLength(1);
    expect(compleet.instellingen?.opnemen).toBe(true);
  });

  it("een sluitingstijd vóór de openingstijd wordt geweigerd; een lijn die nog niet actief is ook", async () => {
    const { bewaarInstellingen, instellingenSchema } = await import("@/lib/telephony/lijn-server");
    const fout = instellingenSchema.parse({ naam: "Jan", doorschakelen: [], belSeconden: 20, openingstijden: { ...STANDAARD_UREN, ma: { van: "17:00", tot: "09:00" } }, menu: [], opnemen: false });
    await expect(bewaarInstellingen(lijn(), fout)).rejects.toThrow(/sluitingstijd/);
    await expect(bewaarInstellingen(lijn({ status: "aangevraagd" }), { ...fout, openingstijden: STANDAARD_UREN })).rejects.toThrow(/actief/);
  });

  it("berichten: bijwerken op het CallSid (gemist → terugbelverzoek met naam), onder de sleutel van de eigenaar", async () => {
    const { bewaarBericht, berichtenVan } = await import("@/lib/telephony/lijn-server");
    await bewaarBericht(lijn(), "CA1", { soort: "gemist", van: "+31699999999" });
    await bewaarBericht(lijn(), "CA1", { soort: "terugbelverzoek", tekst: "Kan ik morgen langskomen?" });
    await bewaarBericht(lijn(), "CA1", { soort: "terugbelverzoek", naam: "Daan" });
    const b = await berichtenVan(lijn());
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ soort: "terugbelverzoek", van: "+31699999999", tekst: "Kan ik morgen langskomen?", naam: "Daan" });
    // de werker is de eigenaar: valt onder het wissen per gebruiker (telefoon:berichten:<userId>:…)
    expect([...kv.keys()]).toContain("telefoon:berichten:u1:l1");
  });

  it("sms alleen naar een nummer dat deze lijn al belde of sms'te, en alleen met de optie sms", async () => {
    const { stuurSms } = await import("@/lib/telephony/lijn-server");
    const metSms = lijn({ selection: { kind: "mobiel097", bundle: "zakelijk", options: [] } });
    await expect(stuurSms(metSms, "+31600000000", "Hoi")).rejects.toThrow(/al belde/);
    await expect(stuurSms(lijn(), "+31600000000", "Hoi")).rejects.toThrow(/Sms hoort niet/);
  });

  it("de lijn bij een gebeld nummer: alleen actief, nooit het eigen nummer van ZekerFlex", async () => {
    const { lijnBijNummer } = await import("@/lib/telephony/lijn-server");
    kv.set("phone-line:l1", lijn());
    kv.set("phone-line:l2", lijn({ id: "l2", status: "in_behandeling", number: "+3197010000002" }));
    expect((await lijnBijNummer("+3197010000001"))?.id).toBe("l1");
    expect(await lijnBijNummer("+3197010000002")).toBeNull();
    expect(await lijnBijNummer(undefined)).toBeNull();
  });
});

describe("de routes en de pagina", () => {
  it("een gesprek naar een klantlijn gaat naar diens instellingen, niet naar het keuzemenu of de leads van ZekerFlex", () => {
    const voice = lees("app/api/telephony/voice/route.ts");
    expect(voice.indexOf("lijnBijNummer(params.To)")).toBeGreaterThan(0);
    expect(voice.indexOf("lijnBijNummer(params.To)")).toBeLessThan(voice.indexOf("// Inkomend: record + taalkeuze"));
    expect(lees("app/api/telephony/sms/route.ts")).toContain("lijnBijNummer(params.To)");
    const route = lees("app/api/telephony/lijn/route.ts");
    expect(route).toContain("if (!signatureValid(request, params)) return handtekeningOngeldigTekst();");
    expect(lees("lib/telephony/lijn-twiml.ts")).not.toMatch(/From|SpeechResult/);
  });

  it("de opname speel je alleen af als eigenaar van de lijn; de Twilio-sleutel blijft op de server", () => {
    const opname = lees("app/api/telefonie/opname/route.ts");
    expect(opname).toContain("lijnVanEigenaar(");
    expect(opname).not.toContain("TWILIO_AUTH_TOKEN");
  });

  it("nergens meer 'binnenkort' bij telefonie: de app-optie is weg, het aanbod is beschikbaar", () => {
    expect(ANSWER_AT.map((a) => a.id)).toEqual(["telefoon", "ai"]);
    expect(lees("lib/telephony/teksten.ts")).not.toMatch(/binnenkort|coming soon|wkrótce|în curând|незабаром/i);
    expect(lees("components/app/Telefonie.tsx")).not.toMatch(/binnenkort|\.soon/);
    const item = AANBOD.find((a) => a.slug === "telefonie");
    expect(item?.status).toBe("beschikbaar");
    expect(`${item?.tekst} ${item?.punten.join(" ")}`).not.toMatch(/beantwoordt vragen|samenvatting/);
  });
});
