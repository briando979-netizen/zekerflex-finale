import { beforeEach, describe, expect, it, vi } from "vitest";

// Het dagrapport en de "wacht op jou"-lijst: de teksten (puur) en het versturen met nagemaakte bronnen.

const h = vi.hoisted(() => ({
  keys: new Set<string>(),
  stuur: vi.fn(async (..._a: unknown[]): Promise<"push" | "whatsapp" | null> => "push"),
  instelling: { aan: true, telefoon: null as string | null, whatsapp: false },
  log: [] as { soort: string; at: string }[],
  triage: vi.fn(async (): Promise<{ kind: string; severity: string; at: string }[]> => []),
  voorstellen: vi.fn(async (): Promise<{ status: string; at: string }[]> => []),
  todos: vi.fn(async (): Promise<{ done: boolean; eerst?: object }[]> => []),
  chats: vi.fn(async (): Promise<{ id: string }[]> => []),
  wacht: vi.fn((c: { id: string }): { at: string } | null => (c.id === "wacht" ? { at: "2026-11-18T09:00:00Z" } : null)),
  orders: vi.fn(async () => ({ _count: { _all: 2 }, _sum: { totalCents: 8450 } })),
  idControles: vi.fn(async (..._a: unknown[]): Promise<{ userId: string; updatedAt: Date; user: { email: string } }[]> => []),
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.com" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: { aggregate: (...a: unknown[]) => (h.orders as unknown as (...x: unknown[]) => unknown)(...a) },
    identityVerification: { findMany: (...a: unknown[]) => h.idControles(...a) },
  },
}));
vi.mock("@/lib/admin/triage", () => ({ getTriage: () => h.triage() }));
vi.mock("@/lib/admin/owner-todos", () => ({ ownerTodos: () => h.todos() }));
vi.mock("@/lib/ai-teams", () => ({ proposals: () => h.voorstellen() }));
vi.mock("@/lib/ai-teams/medewerkers", () => ({ wachtendeVraag: (c: { id: string }) => h.wacht(c) }));
vi.mock("@/lib/chat/webchat", () => ({ listConversations: async (filter: string) => (filter === "open" ? h.chats() : []) }));
vi.mock("@/lib/storage/kv", () => ({
  kvSetIfAbsent: async (k: string) => {
    if (h.keys.has(k)) return false;
    h.keys.add(k);
    return true;
  },
  kvDelete: async (k: string) => void h.keys.delete(k),
  kvDeleteStale: async () => 0,
}));
vi.mock("@/lib/ops/melder", () => ({
  leesInstelling: async () => h.instelling,
  leesGebeurtenissen: async () => h.log,
  stuurNaarEigenaar: (...a: unknown[]) => h.stuur(...a),
}));

import { euro, groepeerWacht, ouderDan, dagrapportTekst, wachtOpJouTekst } from "@/lib/ops/dagrapport-tekst";
import { stuurDagrapport, stuurWachtOpJou, verzamelWacht } from "@/lib/ops/dagrapport";

const AVOND = new Date("2026-11-18T21:00:00+01:00");
const OCHTEND = new Date("2026-11-19T08:30:00+01:00");

beforeEach(() => {
  h.keys.clear();
  h.stuur.mockClear();
  h.stuur.mockImplementation(async () => "push");
  h.instelling = { aan: true, telefoon: null, whatsapp: false };
  h.log = [];
  h.triage.mockImplementation(async () => []);
  h.voorstellen.mockImplementation(async () => []);
  h.todos.mockImplementation(async () => []);
  h.chats.mockImplementation(async () => []);
  h.idControles.mockImplementation(async () => []);
});

describe("dagrapport: teksten", () => {
  it("bedragen in euro's en een datum die te oud is", () => {
    expect(euro(8450)).toBe("€ 84,50");
    expect(ouderDan("2026-11-17T10:00:00Z", new Date("2026-11-18T12:00:00Z"), 24)).toBe(true);
    expect(ouderDan("2026-11-18T10:00:00Z", new Date("2026-11-18T12:00:00Z"), 24)).toBe(false);
    expect(ouderDan("kapot", new Date(), 24)).toBe(false);
    expect(ouderDan("", new Date(), 24)).toBe(false);
  });

  it("groepeert per soort, dringend eerst, dan het oudst, dan het meest", () => {
    const nu = new Date("2026-11-18T12:00:00Z");
    const g = groepeerWacht(
      [
        { soort: "Uren", urgent: false, at: "2026-11-18T10:00:00Z" },
        { soort: "Uren", urgent: false, at: "2026-11-18T11:00:00Z" },
        { soort: "KYC", urgent: false, at: "2026-11-16T10:00:00Z" },
        { soort: "Betaling", urgent: true, at: "2026-11-18T11:00:00Z" },
      ],
      nu,
    );
    expect(g.map((x) => x.soort)).toEqual(["Betaling", "KYC", "Uren"]);
    expect(g[1]).toMatchObject({ aantal: 1, oud: true, urgent: false });
    expect(g[2]).toMatchObject({ aantal: 2, oud: false });
  });

  it("het dagrapport noemt alleen wat er was, en een rustige dag krijgt een zin", () => {
    const tekst = dagrapportTekst({
      datum: "woensdag 18 november",
      telling: { "werker-aangemeld": 3, mail: 41 },
      bestellingen: { aantal: 2, totaalCents: 8450 },
      wacht: [{ soort: "Uren", aantal: 3, urgent: true, oud: false }],
      basisUrl: "https://zekerflex.com/",
    });
    expect(tekst).toContain("dagrapport van woensdag 18 november");
    expect(tekst).toContain("🧑 Nieuwe werkers: 3");
    expect(tekst).toContain("✉️ Verstuurde e-mails: 41");
    expect(tekst).toContain("🛒 Webshop: 2 betaald, samen € 84,50");
    expect(tekst).toContain("🔴 3× Uren");
    expect(tekst).not.toContain("Nieuwe bedrijven");
    const rustig = dagrapportTekst({ datum: "x", telling: {}, bestellingen: { aantal: 0, totaalCents: 0 }, wacht: [], basisUrl: "https://zekerflex.com" });
    expect(rustig).toContain("Een rustige dag");
    expect(rustig).toContain("✅ Er wacht niets op jou.");
    expect(rustig.endsWith("https://zekerflex.com/admin/automatisch")).toBe(true);
  });

  it("een groep met 'altijd' komt in de ochtendlijst, met zijn adres; een groep zonder blijft stil", () => {
    const tekst = wachtOpJouTekst([{ soort: "ID-controle in behandeling", aantal: 2, urgent: false, oud: false, altijd: true, link: "/admin/gebruikers" }], "https://zekerflex.com/");
    expect(tekst).toContain("2× ID-controle in behandeling");
    expect(tekst).toContain("ID-controle in behandeling: https://zekerflex.com/admin/gebruikers");
    expect(wachtOpJouTekst([{ soort: "Uren", aantal: 2, urgent: false, oud: false, link: "/werkgever/uren" }], "https://zekerflex.com")).toBeNull();
  });

  it("de ochtendlijst komt alleen bij iets dringends of iets van meer dan 24 uur", () => {
    expect(wachtOpJouTekst([], "https://zekerflex.com")).toBeNull();
    expect(wachtOpJouTekst([{ soort: "Uren", aantal: 4, urgent: false, oud: false }], "https://zekerflex.com")).toBeNull();
    const tekst = wachtOpJouTekst(
      [
        { soort: "Uren", aantal: 4, urgent: false, oud: false },
        { soort: "KYC", aantal: 2, urgent: false, oud: true },
      ],
      "https://zekerflex.com",
    );
    expect(tekst).toContain("6 in totaal");
    expect(tekst).toContain("🟠 2× KYC (al langer dan 24 uur)");
    expect(tekst).not.toContain("Uren"); // alleen wat dringend of oud is
  });
});

describe("dagrapport: verzamelen en versturen", () => {
  it("verzamelt uit de triage, de voorstellen, de websitevragen en de blokkerende taken; een kapotte bron telt niet mee", async () => {
    h.triage.mockImplementation(async () => [{ kind: "Uren", severity: "medium", at: "2026-11-18T10:00:00Z" }]);
    h.voorstellen.mockImplementation(async () => [
      { status: "open", at: "2026-11-18T10:00:00Z" },
      { status: "done", at: "2026-11-18T10:00:00Z" },
    ]);
    h.todos.mockImplementation(async () => [{ done: false, eerst: {} }, { done: true, eerst: {} }, { done: false }]);
    h.chats.mockImplementation(async () => [{ id: "wacht" }, { id: "anders" }]);
    const wacht = await verzamelWacht(new Date("2026-11-18T20:00:00Z"));
    expect(wacht.map((g) => `${g.aantal}× ${g.soort}`).sort()).toEqual(["1× AI-voorstellen", "1× Taken die blokkeren (Te doen)", "1× Uren", "1× Websitevragen zonder antwoord"]);
    h.triage.mockImplementation(async () => {
      throw new Error("db stuk");
    });
    expect((await verzamelWacht(new Date("2026-11-18T20:00:00Z"))).some((g) => g.soort === "Uren")).toBe(false);
  });

  it("een ID-controle die op een mens wacht komt als eigen groep, ook als hij vers is, en testaccounts tellen niet mee (19 nov)", async () => {
    // zelfde werker twee keer (twee pogingen) telt één keer; een testadres telt niet; de triage-groep 'KYC' (iedereen met PENDING) vervalt
    h.triage.mockImplementation(async () => [{ kind: "KYC", severity: "low", at: "2026-11-19T00:25:00Z" }]);
    h.idControles.mockImplementation(async () => [
      { userId: "u1", updatedAt: new Date("2026-11-19T00:30:00Z"), user: { email: "werker@gmail.com" } },
      { userId: "u1", updatedAt: new Date("2026-11-19T00:25:00Z"), user: { email: "werker@gmail.com" } },
      { userId: "u2", updatedAt: new Date("2026-11-19T00:10:00Z"), user: { email: "iemand@zekerflex.test" } },
    ]);
    const wacht = await verzamelWacht(new Date("2026-11-19T07:30:00Z"));
    expect(wacht).toEqual([{ soort: "ID-controle in behandeling", aantal: 1, urgent: false, oud: false, altijd: true, link: "/admin/gebruikers" }]);
    // en de ochtendlijst gaat er om 07:30 UTC voor uit, met een direct adres naar Beheer en zonder naam of gegevens
    expect(await stuurWachtOpJou(new Date("2026-11-19T08:30:00+01:00"))).toEqual({ gemeld: true, reden: null });
    const tekst = String(h.stuur.mock.calls[0]?.[0]);
    expect(tekst).toContain("1× ID-controle in behandeling");
    expect(tekst).toContain("ID-controle in behandeling: https://zekerflex.com/admin/gebruikers");
    expect(tekst).not.toMatch(/gmail|u1|werker@/);
    // geen ID-controle in behandeling: dan geen ochtendbericht om niets
    h.idControles.mockImplementation(async () => []);
    h.stuur.mockClear();
    expect((await stuurWachtOpJou(new Date("2026-11-20T08:30:00+01:00"))).gemeld).toBe(false);
    expect(h.stuur).not.toHaveBeenCalled();
  });

  it("het dagrapport telt alleen vandaag (Amsterdam), neemt de bestellingen mee en gaat één keer per dag", async () => {
    h.log = [
      { soort: "werker-aangemeld", at: "2026-11-18T08:00:00Z" },
      { soort: "werker-aangemeld", at: "2026-11-18T09:00:00Z" },
      { soort: "werker-aangemeld", at: "2026-11-17T20:00:00Z" }, // gisteren
      { soort: "bestelling", at: "2026-11-18T09:00:00Z" }, // bestellingen komen uit de database
    ];
    expect(await stuurDagrapport(AVOND)).toEqual({ gemeld: true, reden: null });
    const tekst = String(h.stuur.mock.calls[0]?.[0]);
    expect(tekst).toContain("🧑 Nieuwe werkers: 2");
    expect(tekst).toContain("🛒 Webshop: 2 betaald, samen € 84,50");
    expect(tekst).not.toContain("Webshopbestellingen:");
    expect(await stuurDagrapport(AVOND)).toEqual({ gemeld: false, reden: "vandaag al verstuurd" });
    expect(h.stuur).toHaveBeenCalledTimes(1);
  });

  it("bereikt het bericht niemand, dan mag het die dag opnieuw", async () => {
    h.stuur.mockImplementation(async () => null);
    expect((await stuurDagrapport(AVOND)).gemeld).toBe(false);
    h.stuur.mockImplementation(async () => "push");
    expect((await stuurDagrapport(AVOND)).gemeld).toBe(true);
  });

  it("'s nachts en met de meldingen uit gaat er niets", async () => {
    expect((await stuurDagrapport(new Date("2026-11-18T03:00:00+01:00"))).reden).toBe("buiten de meldtijd");
    h.instelling = { aan: false, telefoon: null, whatsapp: false };
    expect((await stuurDagrapport(AVOND)).reden).toBe("meldingen staan uit");
    expect(h.stuur).not.toHaveBeenCalled();
  });

  it("de ochtendlijst gaat alleen als er iets dringends wacht", async () => {
    expect(await stuurWachtOpJou(OCHTEND)).toEqual({ gemeld: false, reden: "niets verstuurd of geen kanaal bereikte de eigenaar" });
    expect(h.stuur).not.toHaveBeenCalled();
    h.triage.mockImplementation(async () => [{ kind: "Betaling", severity: "high", at: "2026-11-19T06:00:00Z" }]);
    expect(await stuurWachtOpJou(OCHTEND)).toEqual({ gemeld: true, reden: null });
    expect(String(h.stuur.mock.calls[0]?.[0])).toContain("🔴 1× Betaling");
    expect(h.stuur.mock.calls[0]?.[1]).toBe("/admin/te-doen");
  });
});
