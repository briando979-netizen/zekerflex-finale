import { beforeEach, describe, expect, it, vi } from "vitest";

// Werkervaring van een werker: pure regels (lib/werker/ervaring.ts), opslag in KV en de route
// /api/me/ervaring (alleen de eigen werker, begrensde invoer).

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), principal: { userId: "u1", email: "w@x.test", fullName: "W", grants: [] } as unknown }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => h.principal }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { forRequest: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) } }));

import { controleerErvaring, ervaringPeriode, leesErvaringStand, schoonTekst, sorteerErvaring, OMSCHRIJVING_MAX, ERVARING_MAX } from "@/lib/werker/ervaring";
import { getErvaring, voegErvaringToe } from "@/lib/werker/ervaring-store";
import { DELETE, GET, POST } from "@/app/api/me/ervaring/route";

// vaste klok, met zone: 10 nov 2026 (jaar 2026, maand 11)
const NU = new Date("2026-11-10T12:00:00+01:00");
const basis = { functie: "Magazijnmedewerker", bedrijf: "Voorbeeld BV", vanMaand: 3, vanJaar: 2022, nu: false, totMaand: 6, totJaar: 2023 };
const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  h.kv.clear();
  h.principal = { userId: "u1", email: "w@x.test", fullName: "W", grants: [] };
});

describe("controleerErvaring", () => {
  it("accepteert een geldige ervaring en maakt tekst schoon", () => {
    const r = controleerErvaring({ ...basis, functie: " <b>Chauffeur</b> ", omschrijving: "a".repeat(500) }, 2026, 11);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.waarde.functie).toBe("bChauffeur/b");
      expect(r.waarde.omschrijving).toHaveLength(OMSCHRIJVING_MAX);
    }
  });
  it("vereist een bedrijf, maar geen functie", () => {
    expect(controleerErvaring({ ...basis, bedrijf: "  " }, 2026, 11).ok).toBe(false);
    expect(controleerErvaring({ ...basis, functie: "" }, 2026, 11).ok).toBe(true);
  });
  it("weigert datums in de toekomst en een einde vóór het begin", () => {
    expect(controleerErvaring({ ...basis, vanJaar: 2026, vanMaand: 12, nu: true }, 2026, 11).ok).toBe(false);
    expect(controleerErvaring({ ...basis, totJaar: 2021 }, 2026, 11).ok).toBe(false);
    expect(controleerErvaring({ ...basis, totJaar: 2026, totMaand: 12 }, 2026, 11).ok).toBe(false);
    expect(controleerErvaring({ ...basis, vanMaand: 13 }, 2026, 11).ok).toBe(false);
  });
  it("lopend werk heeft geen einddatum", () => {
    const r = controleerErvaring({ ...basis, nu: true, totJaar: 1999 }, 2026, 11);
    expect(r.ok && r.waarde.totJaar).toBeNull();
  });
});

describe("hulpjes", () => {
  it("schoonTekst haalt stuurtekens en HTML-haken weg", () => {
    expect(schoonTekst("a\u0000<script>b", 50)).toBe("ascriptb");
    expect(schoonTekst(5, 10)).toBe("");
  });
  it("sorteert lopend werk bovenaan", () => {
    const a = { id: "a", functie: "", bedrijf: "A", vanMaand: 1, vanJaar: 2010, nu: false, totMaand: 1, totJaar: 2012, omschrijving: "" };
    const b = { ...a, id: "b", vanJaar: 2000, nu: true, totMaand: null, totJaar: null };
    expect(sorteerErvaring([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("leest een kapotte bewaarde waarde soepel", () => {
    expect(leesErvaringStand("troep", 2026, 11)).toEqual({ items: [], geen: false });
    const s = leesErvaringStand(
      { items: [{ id: "x", bedrijf: "", vanMaand: 1, vanJaar: 2020, nu: true }, { id: "y", functie: "F", bedrijf: "B", vanMaand: 1, vanJaar: 2020, nu: true }], geen: true },
      2026,
      11,
    );
    expect(s.items.map((i) => i.id)).toEqual(["y"]);
    expect(s.geen).toBe(true);
  });
  it("maakt een periode met de maandnamen van de aanroeper", () => {
    const m = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const e = { id: "a", functie: "", bedrijf: "A", vanMaand: 3, vanJaar: 2022, nu: true, totMaand: null, totJaar: null, omschrijving: "" };
    expect(ervaringPeriode(e, m, "nu")).toBe("mrt 2022 – nu");
    expect(ervaringPeriode({ ...e, nu: false, totMaand: 6, totJaar: 2023 }, m, "nu")).toBe("mrt 2022 – jun 2023");
  });
});

describe("opslag", () => {
  it("stopt bij het maximum", async () => {
    for (let i = 0; i < ERVARING_MAX; i++) expect((await voegErvaringToe("u1", basis, NU)).ok).toBe(true);
    expect((await voegErvaringToe("u1", basis, NU)).ok).toBe(false);
    expect((await getErvaring("u1", NU)).items).toHaveLength(ERVARING_MAX);
  });
});

function verzoek(methode: string, body?: unknown): Request {
  return new Request("http://x/api/me/ervaring", { method: methode, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe("route /api/me/ervaring", () => {
  it("voegt toe, geeft de stand terug en verwijdert alleen binnen de eigen sleutel", async () => {
    const r = await POST(verzoek("POST", { actie: "toevoegen", ...basis }), ctx);
    expect(r.status).toBe(201);
    const stand = (await r.json()) as { items: { id: string }[] };
    expect(stand.items).toHaveLength(1);
    expect(h.kv.has("werker-ervaring:u1")).toBe(true);
    const g = await GET(verzoek("GET"), ctx);
    expect(((await g.json()) as { items: unknown[] }).items).toHaveLength(1);
    // een andere werker ziet niets en kan het niet raken
    h.principal = { userId: "u2", email: "v@x.test", fullName: "V", grants: [] };
    const d2 = await DELETE(verzoek("DELETE", { id: stand.items[0]?.id }), ctx);
    expect(((await d2.json()) as { items: unknown[] }).items).toHaveLength(0);
    expect((h.kv.get("werker-ervaring:u1") as { items: unknown[] }).items).toHaveLength(1);
    h.principal = { userId: "u1", email: "w@x.test", fullName: "W", grants: [] };
    const d1 = await DELETE(verzoek("DELETE", { id: stand.items[0]?.id }), ctx);
    expect(((await d1.json()) as { items: unknown[] }).items).toHaveLength(0);
  });
  it("weigert te lange of onbekende invoer met 422 en bewaart 'geen werkervaring'", async () => {
    expect((await POST(verzoek("POST", { actie: "toevoegen", ...basis, omschrijving: "x".repeat(900) }), ctx)).status).toBe(422);
    expect((await POST(verzoek("POST", { actie: "iets" }), ctx)).status).toBe(422);
    const geen = await POST(verzoek("POST", { actie: "geen", geen: true }), ctx);
    expect(((await geen.json()) as { geen: boolean }).geen).toBe(true);
  });
});
