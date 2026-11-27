import { beforeEach, describe, expect, it, vi } from "vitest";
import { aanvraagOntbreekt, aanvraagSamenvatting, emailGeldig, telefoonGeldig } from "@/lib/klusconcept/aanvraag";

// "Liever zonder account? Wij zetten je klus voor je online" op /klus-plaatsen (27 nov 2026): een bedrijf laat alleen naam,
// bedrijf en telefoon of e-mail achter. Er komt niets online; het wordt een verkoopaanvraag en een mail aan sales@.

const m = vi.hoisted(() => ({ createLead: vi.fn(async () => ({ id: "l1" })), sendMail: vi.fn(async () => undefined) }));
vi.mock("@/lib/sales/leads", () => ({ createLead: m.createLead }));
vi.mock("@/lib/mail", () => ({ sendMail: m.sendMail, mailShell: (t: string, b: string) => `${t}${b}`, escapeHtml: (s: string) => s }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })), privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/analytics/track", () => ({ recordServerEvent: vi.fn(async () => undefined) }));

const { POST } = await import("@/app/api/klus-plaatsen/aanvraag/route");

const klus = { functie: "Vakkenvuller", plaats: "Veendam", datum: "2026-12-03", van: "09:00", tot: "17:00", aantal: 2, tariefCents: 1620 };
const verzoek = (body: unknown, extra: Record<string, string> = {}) => {
  const tekst = JSON.stringify(body);
  return new Request("https://zekerflex.com/api/klus-plaatsen/aanvraag", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://zekerflex.com", "content-length": String(tekst.length), ...extra },
    body: tekst,
  });
};

describe("aanvraag: controle en samenvatting (puur)", () => {
  it("naam, bedrijf en telefoon óf e-mail zijn genoeg", () => {
    expect(aanvraagOntbreekt({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "06 12345678", email: "" })).toBeNull();
    expect(aanvraagOntbreekt({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "", email: "anna@bakkerij.nl" })).toBeNull();
    expect(aanvraagOntbreekt({ naam: "", bedrijf: "Bakkerij", telefoon: "0612345678", email: "" })?.veld).toBe("naam");
    expect(aanvraagOntbreekt({ naam: "Anna", bedrijf: " ", telefoon: "0612345678", email: "" })?.veld).toBe("bedrijf");
    expect(aanvraagOntbreekt({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "", email: "" })?.veld).toBe("contact");
    expect(aanvraagOntbreekt({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "123", email: "" })?.tekst).toContain("telefoonnummer klopt niet");
    expect(aanvraagOntbreekt({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "", email: "anna@" })?.tekst).toContain("e-mailadres klopt niet");
  });

  it("telefoon en e-mail", () => {
    expect(telefoonGeldig("+31 6 1234 5678")).toBe(true);
    expect(telefoonGeldig("0598-123456")).toBe(true);
    expect(telefoonGeldig("bel me")).toBe(false);
    expect(emailGeldig("a@b.nl")).toBe(true);
    expect(emailGeldig("a b@c.nl")).toBe(false);
  });

  it("de klus in een paar regels, lege onderdelen vallen weg", () => {
    expect(aanvraagSamenvatting(klus)).toEqual([
      "Functie: Vakkenvuller",
      "Plaats: Veendam",
      "Wanneer: do 3 december 2026, 09:00–17:00",
      "Aantal mensen: 2",
      "Uurtarief: € 16,20",
    ]);
    expect(aanvraagSamenvatting({ functie: "", plaats: "", datum: "", van: "", tot: "", aantal: 0, tariefCents: 0 })).toEqual([]);
  });
});

describe("POST /api/klus-plaatsen/aanvraag", () => {
  beforeEach(() => {
    m.createLead.mockClear();
    m.sendMail.mockClear();
  });

  it("maakt een verkoopaanvraag en mailt sales@", async () => {
    const r = await POST(verzoek({ naam: "Anna", bedrijf: "Bakkerij De Korst", telefoon: "0612345678", email: "", klus }));
    expect(r.status).toBe(200);
    expect(m.createLead).toHaveBeenCalledTimes(1);
    expect(m.createLead.mock.calls[0]?.[0]).toMatchObject({ companyName: "Bakkerij De Korst", contactName: "Anna", contactPhone: "0612345678", city: "Veendam", source: "klus-aanvraag" });
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.sendMail.mock.calls[0]?.[0]).toMatchObject({ to: "sales@zekerflex.com", kind: "klus-aanvraag" });
  });

  it("zonder telefoon of e-mail: 422 met uitleg, niets aangemaakt", async () => {
    const r = await POST(verzoek({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "", email: "", klus }));
    expect(r.status).toBe(422);
    expect(JSON.stringify(await r.json())).toContain("telefoonnummer of e-mailadres");
    expect(m.createLead).not.toHaveBeenCalled();
  });

  it("een bot (verborgen veld) en een testadres maken geen aanvraag en geen mail", async () => {
    expect((await POST(verzoek({ naam: "Bot", bedrijf: "Bot BV", telefoon: "0612345678", extra: "x", klus }))).status).toBe(200);
    expect((await POST(verzoek({ naam: "Test", bedrijf: "Test BV", email: "proef@zekerflex.test", klus }))).status).toBe(200);
    expect(m.createLead).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it("weigert een te grote body (422) en een post van een andere website", async () => {
    expect((await POST(verzoek({ naam: "Anna" }, { "content-length": "999999" }))).status).toBe(422);
    expect((await POST(verzoek({ naam: "Anna", bedrijf: "Bakkerij", telefoon: "0612345678", klus }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(m.createLead).not.toHaveBeenCalled();
  });
});
