import { beforeEach, describe, expect, it, vi } from "vitest";

// Webshop → Op locatie: de bon van een verkoop in de winkel naar de klant mailen. Alleen een
// verkoop met kanaal "winkel" van deze site; een antwoord gaat naar de winkel (Reply-To).

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), mails: [] as { to: string; subject: string; text: string; html?: string; replyTo?: string; kind?: string }[] }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListValues: async () => [],
  kvDelete: async () => undefined,
}));
vi.mock("@/lib/sites/store", () => ({ saveWinkel: async () => ({}), getSite: async () => null }));
vi.mock("@/lib/mail", async () => {
  const echt = await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail");
  return { ...echt, sendMail: async (m: (typeof h.mails)[number]) => (h.mails.push(m), { id: "m", delivered: true, transport: "smtp" }) };
});

import { kassaBonMail, kassaBonMailSchema, mailKassaBon } from "@/lib/sites/kassa-server";
import type { SiteDoc } from "@/lib/sites/types";

const site = { id: "s1", bedrijf: { naam: "Jk <test> shop", email: "winkel@voorbeeld.nl", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Ergens", telefoon: "" } } as unknown as SiteDoc;
const verkoop = {
  id: "o1abcdefghij",
  nr: "K7Q2MX",
  at: "2026-11-10T21:05:00Z",
  status: "afgerond",
  kanaal: "winkel",
  kassa: { methode: "contant", ontvangenCents: 2000, wisselgeldCents: 505 },
  regels: [{ productId: "pet", naam: "Pet", prijsCents: 1495, aantal: 1, totaalCents: 1495 }],
  subtotaalCents: 1495,
  bezorgkostenCents: 0,
  totaalCents: 1495,
  invoer: {},
};

beforeEach(() => {
  h.kv.clear();
  h.mails.length = 0;
});

describe("de bon mailen", () => {
  it("stuurt de bon van een winkelverkoop, met antwoorden naar de winkel", async () => {
    h.kv.set("site-bestelling:s1:o1abcdefghij", verkoop);
    expect(await mailKassaBon(site, "o1abcdefghij", "klant@voorbeeld.nl")).toEqual({ verstuurd: true });
    const m = h.mails[0]!;
    expect(m).toMatchObject({ to: "klant@voorbeeld.nl", subject: "Je bon van Jk <test> shop", replyTo: "winkel@voorbeeld.nl", kind: "kassabon" });
    expect(m.text).toMatch(/Bon K7Q2MX/);
    expect(m.text).toMatch(/Wisselgeld\s+€ 5,05/);
    expect(m.html).not.toMatch(/<test>/);
    expect(m.html).toMatch(/&lt;test&gt;/);
  });

  it("weigert een webshopbestelling, een onbekende verkoop en een raar id", async () => {
    h.kv.set("site-bestelling:s1:o1abcdefghij", { ...verkoop, kanaal: undefined, kassa: undefined });
    await expect(mailKassaBon(site, "o1abcdefghij", "klant@voorbeeld.nl")).rejects.toThrow(/bestaat niet/);
    await expect(mailKassaBon(site, "o1onbekend123", "klant@voorbeeld.nl")).rejects.toThrow(/bestaat niet/);
    await expect(mailKassaBon(site, "../x", "klant@voorbeeld.nl")).rejects.toThrow(/bestaat niet/);
    expect(h.mails).toHaveLength(0);
  });

  it("zonder e-mailadres van de winkel geen Reply-To en geen zin over antwoorden", () => {
    const met = kassaBonMail({ nr: "A", op: "2026-11-10T10:00:00Z", winkel: { naam: "W" }, regels: [], totaalCents: 0, methode: "pin" }, "w@voorbeeld.nl");
    const zonder = kassaBonMail({ nr: "A", op: "2026-11-10T10:00:00Z", winkel: { naam: "W" }, regels: [], totaalCents: 0, methode: "pin" });
    expect(met.text).toMatch(/Antwoord op deze mail/);
    expect(zonder.text).not.toMatch(/Antwoord op deze mail/);
  });

  it("controleert het adres en het id", () => {
    expect(kassaBonMailSchema.safeParse({ id: "o1abcdefghij", email: "geen-adres" }).success).toBe(false);
    expect(kassaBonMailSchema.parse({ id: "o1abcdefghij", email: " Klant@Voorbeeld.NL " }).email).toBe("klant@voorbeeld.nl");
  });
});
