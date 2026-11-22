import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De verzending van een sales-mail (18 nov 2026). Een mail die de mailserver weigerde (sendMail geeft delivered: false
// met transport "smtp") is NIET verstuurd: het concept wordt FAILED, de stap schuift niet door en de motor probeert het
// een dag later opnieuw, hooguit drie keer. Een testadres blijft bewust in de eigen postbus (transport "mailbox") en
// geldt als gelukt. Een concept uit de vaste campagnetekst krijgt de knop van de campagne en is de enige mail van de reeks.

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const outreachFindUnique = vi.fn();
const outreachUpdate = vi.fn().mockResolvedValue({});
const outreachCount = vi.fn().mockResolvedValue(0);
const leadUpdate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    salesOutreach: {
      findUnique: (...a: unknown[]) => outreachFindUnique(...a),
      update: (...a: unknown[]) => outreachUpdate(...a),
      count: (...a: unknown[]) => outreachCount(...a),
    },
    salesLead: { update: (...a: unknown[]) => leadUpdate(...a) },
  },
}));

const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (_titel: string, html: string) => `<body>${html}</body>`,
  mailButton: (href: string, label: string) => `<a href="${href}">${label}</a>`,
}));
vi.mock("@/lib/sales/campaign", () => ({
  campaignSendCountToday: vi.fn().mockResolvedValue(0),
  globalSendCountToday: vi.fn().mockResolvedValue(0),
  withinSendWindow: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/sales/suppression", () => ({
  addSuppression: vi.fn().mockResolvedValue(undefined),
  isSuppressed: vi.fn().mockResolvedValue({ blocked: false }),
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
}));
const leesCampagneTekst = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/sales/campagne-tekst-opslag", () => ({ leesCampagneTekst: (...a: unknown[]) => leesCampagneTekst(...a) }));

import { bouwOutreachMail, sendOutreachMail } from "@/lib/sales/send";

const NU = new Date("2026-11-18T10:00:00+01:00");
const campagne = { id: "c1", stepDelaysDays: [0, 4, 10], fromAddress: null, dailyCap: 40 };
const concept = (velden: Record<string, unknown> = {}, lead: Record<string, unknown> = {}) => ({
  id: "o1",
  status: "APPROVED",
  stepIndex: 0,
  subject: "Aanbod voor Bakkerij Acme",
  body: "Beste heer/mevrouw,\n\nRegel een\nRegel twee",
  generatedByModel: "self-hosted-llm",
  ...velden,
  lead: { id: "l1", companyName: "Bakkerij Acme & Zn", contactEmail: "info@acme.nl", discoveredEmail: null, status: "APPROVED", campaign: campagne, ...lead },
});
const outreachData = () => (outreachUpdate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;
const leadData = () => (leadUpdate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  outreachCount.mockResolvedValue(0);
  leesCampagneTekst.mockResolvedValue(null);
});

describe("sales-mail versturen: aangekomen of niet", () => {
  it("aangekomen via de mailserver: SENT, de stap schuift door en de volgende staat gepland", async () => {
    outreachFindUnique.mockResolvedValue(concept());
    sendMail.mockResolvedValue({ id: "m1", delivered: true, transport: "smtp" });
    const uit = await sendOutreachMail("o1", "manual");
    expect(uit.status).toBe("sent");
    expect(outreachData()).toMatchObject({ status: "SENT", mailId: "m1", sentVia: "manual" });
    expect(leadData()).toMatchObject({ status: "SENT", sequenceStep: 1, nextActionAt: new Date(NU.getTime() + 4 * 86_400_000) });
  });

  it("de mailserver weigerde (delivered false, transport smtp): FAILED met een leesbare reden, geen SENT, de stap blijft staan", async () => {
    outreachFindUnique.mockResolvedValue(concept());
    sendMail.mockResolvedValue({ id: "m2", delivered: false, transport: "smtp", error: "RCPT TO <info@acme.nl> -> 550 mailbox unavailable" });
    const uit = await sendOutreachMail("o1", "manual");
    expect(uit.status).toBe("failed");
    expect(uit.reason).toMatch(/^Verzenden mislukt: /);
    // het adres hoort niet in de reden (die komt in het beheer en in het log)
    expect(uit.reason).not.toContain("info@acme.nl");
    expect(outreachData()).toMatchObject({ status: "FAILED", failReason: uit.reason });
    expect(outreachUpdate.mock.calls.some((c) => (c[0] as { data: { status?: string } }).data.status === "SENT")).toBe(false);
    const lead = leadData();
    expect("sequenceStep" in lead).toBe(false);
    expect("status" in lead).toBe(false);
    expect("lastContactedAt" in lead).toBe(false);
    // morgen een nieuwe poging (de motor maakt dan een nieuw concept)
    expect(lead.nextActionAt).toEqual(new Date(NU.getTime() + 86_400_000));
  });

  it("na de derde mislukte verzending probeert de motor het niet meer vanzelf", async () => {
    outreachFindUnique.mockResolvedValue(concept());
    outreachCount.mockResolvedValue(2);
    sendMail.mockResolvedValue({ id: "m3", delivered: false, transport: "smtp", error: "timeout" });
    await sendOutreachMail("o1", "autopilot");
    expect(outreachCount).toHaveBeenCalledWith({ where: { leadId: "l1", status: "FAILED" } });
    expect(leadData().nextActionAt).toBeNull();
  });

  it("een testadres blijft in de eigen postbus (transport mailbox): dat geldt als gelukt", async () => {
    outreachFindUnique.mockResolvedValue(concept({}, { contactEmail: "inkoop@bedrijf.test" }));
    sendMail.mockResolvedValue({ id: "m4", delivered: false, transport: "mailbox" });
    const uit = await sendOutreachMail("o1", "manual");
    expect(uit.status).toBe("sent");
    expect(outreachData()).toMatchObject({ status: "SENT" });
  });
});

describe("sales-mail versturen: een concept uit de vaste campagnetekst", () => {
  const vast = { onderwerp: "x", tekst: "y", knopTekst: "Maak gratis een account", knopUrl: "/register?type=bedrijf", zonderVacature: true, bijgewerkt: "", door: "" };

  it("krijgt de knop van de campagne en is de enige mail: de reeks is daarna klaar", async () => {
    outreachFindUnique.mockResolvedValue(concept({ generatedByModel: "campagne-tekst" }));
    leesCampagneTekst.mockResolvedValue(vast);
    sendMail.mockResolvedValue({ id: "m5", delivered: true, transport: "smtp" });
    await sendOutreachMail("o1", "manual");
    const mail = sendMail.mock.calls[0]![0] as { html: string; text: string; kind: string };
    expect(mail.kind).toBe("sales-outreach");
    expect(mail.html).toContain('/register?type=bedrijf">Maak gratis een account</a>');
    expect(mail.html).not.toContain("Bekijk ZekerFlex voor bedrijven");
    expect(mail.text).toContain("Maak gratis een account: ");
    expect(leadData()).toMatchObject({ status: "SENT", sequenceStep: campagne.stepDelaysDays.length, nextActionAt: null });
  });

  it("een gewoon concept in dezelfde campagne houdt de gewone knop en de gewone reeks", async () => {
    outreachFindUnique.mockResolvedValue(concept());
    leesCampagneTekst.mockResolvedValue(vast);
    sendMail.mockResolvedValue({ id: "m6", delivered: true, transport: "smtp" });
    await sendOutreachMail("o1", "manual");
    const mail = sendMail.mock.calls[0]![0] as { html: string };
    // sinds 22 nov 2026 naar /bedrijven (/voor-bedrijven is daarin opgegaan en stuurt door)
    expect(mail.html).toContain('/bedrijven">Bekijk ZekerFlex voor bedrijven</a>');
    expect(mail.html).not.toContain("/voor-bedrijven");
    expect(leesCampagneTekst).not.toHaveBeenCalled();
    expect(leadData()).toMatchObject({ sequenceStep: 1 });
  });
});

describe("de opbouw van de mail", () => {
  it("een regeleinde binnen een alinea wordt een echte regelafbreking, en tekens uit de tekst of de bedrijfsnaam breken de opmaak niet", () => {
    const { html, text } = bouwOutreachMail({ companyName: "Jansen & Zn <bv>", subject: "Onderwerp", body: "Zo werkt het:\n1. Eerst <dit>\n2. Dan dat\n\nGroet" });
    expect(html).toContain("Zo werkt het:<br>1. Eerst &lt;dit><br>2. Dan dat</p>");
    expect(html).not.toContain("&lt;br>");
    expect(html).toContain("Jansen &amp; Zn &lt;bv> mogelijk baat heeft bij flexibele bezetting.");
    expect(html).toContain("Je ontvangt dit bericht als zakelijke introductie");
    expect(text).toContain("Meer weten: ");
    expect(text.endsWith("Zekerflex, Inc.")).toBe(true);
  });

  it("het naschrift (alleen de voorbeeldmail) staat onderaan", () => {
    const { html, text } = bouwOutreachMail({ companyName: "Voorbeeld B.V.", subject: "S", body: "Tekst", naschrift: "Dit is een voorbeeld." });
    expect(html).toContain("Dit is een voorbeeld.</p>");
    expect(text.endsWith("Dit is een voorbeeld.")).toBe(true);
  });
});
