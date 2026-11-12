import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Het werkgeversdeel van de nachtelijke rondgang (12 nov 2026, opdracht van ae): een vaste .test-werkgever met een eigen
// testbedrijf, de gewone aanmelding, alleen GET, de sessie alleen in het geheugen. Anders dan bij de werker maakt de code
// het account nooit zelf aan, en weigert hij elk account dat niet precies het testaccount is.

const e = vi.hoisted(() => ({ env: { APP_BASE_URL: "https://zekerflex.com", RONDGANG_WERKGEVER_PASS: "x".repeat(32) as string | undefined, RONDGANG_WERKGEVER_EMAIL: undefined as string | undefined } }));
vi.mock("@/lib/env", () => ({ env: e.env }));
const db = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => db.findUnique(...a), update: (...a: unknown[]) => db.update(...a), create: (...a: unknown[]) => db.create(...a) } },
}));

import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { RONDGANG_TESTBEDRIJF, RONDGANG_WERKGEVER_STANDAARD, WERKGEVER_PAGINAS, draaiWerkgeverRondgang, rondgangWerkgever, waaromNietGeschikt } from "@/lib/ops/rondgang-werkgever";

const GEHEIM = "werkgeverssessie-die-nergens-mag-staan";
const antwoord = (status: number, body = "", koppen: Record<string, string> = {}, cookies: string[] = []) => {
  const headers = new Headers(koppen);
  for (const c of cookies) headers.append("set-cookie", c);
  return { status, headers, json: async () => JSON.parse(body || "{}"), text: async () => body };
};
const PAGINA = `<html><body><main>${"Een gewone werkgeverspagina met genoeg tekst. ".repeat(20)}</main></body></html>`;
const testRol = [{ role: "HQ_ADMIN", tenant: { name: RONDGANG_TESTBEDRIJF } }];
const account = (extra: Record<string, unknown> = {}) => ({ id: "u_wg", passwordHash: bcrypt.hashSync("x".repeat(32), 4), disabledAt: null, emailVerifiedAt: new Date("2026-11-12T20:00:00Z"), memberships: testRol, ...extra });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  e.env.RONDGANG_WERKGEVER_PASS = "x".repeat(32);
  e.env.RONDGANG_WERKGEVER_EMAIL = undefined;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("de pagina's", () => {
  it("bestaan allemaal, zijn vast en horen bij de werkgeversapp (werkruimte personeel)", () => {
    const vast = new Set(APP_PAGES.filter((p) => !p.dynamic).map((p) => p.route));
    for (const p of WERKGEVER_PAGINAS) {
      expect(vast.has(p), p).toBe(true);
      expect(p === "/werkgever" || p.startsWith("/werkgever/")).toBe(true);
    }
    expect([...WERKGEVER_PAGINAS]).toEqual(["/werkgever", "/werkgever/diensten", "/werkgever/diensten/nieuw", "/werkgever/kalender", "/werkgever/facturen", "/werkgever/team", "/werkgever/instellingen"]);
  });
});

describe("welk account mag", () => {
  it("alleen een .test-adres dat alleen beheerder is van het testbedrijf", () => {
    const ok = { email: RONDGANG_WERKGEVER_STANDAARD, rollen: [{ role: "HQ_ADMIN", bedrijf: RONDGANG_TESTBEDRIJF }] };
    expect(waaromNietGeschikt(ok)).toBeNull();
    expect(waaromNietGeschikt({ ...ok, email: "baas@echtbedrijf.nl" })).toMatch(/testdomein/);
    expect(waaromNietGeschikt({ ...ok, rollen: [] })).toMatch(/geen bedrijf/);
    expect(waaromNietGeschikt({ ...ok, rollen: [...ok.rollen, { role: "PLATFORM_ADMIN", bedrijf: "ZekerFlex" }] })).toMatch(/PLATFORM_ADMIN/);
    expect(waaromNietGeschikt({ ...ok, rollen: [{ role: "FREELANCER", bedrijf: RONDGANG_TESTBEDRIJF }] })).toMatch(/FREELANCER/);
    expect(waaromNietGeschikt({ ...ok, rollen: [{ role: "HQ_ADMIN", bedrijf: "Bakkerij De Echte" }] })).toMatch(/ander bedrijf/);
  });

  it("maakt nooit een account aan; bestaat het niet, dan overgeslagen met de reden", async () => {
    db.findUnique.mockResolvedValue(null);
    expect(await rondgangWerkgever(RONDGANG_WERKGEVER_STANDAARD, "x".repeat(32))).toEqual({ reden: expect.stringMatching(/bestaat nog niet/) });
    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("zet alleen het wachtwoord gelijk, op precies dat account, en alleen als het veranderde", async () => {
    db.findUnique.mockResolvedValue(account());
    expect(await rondgangWerkgever(RONDGANG_WERKGEVER_STANDAARD, "x".repeat(32))).toEqual({ id: "u_wg" });
    expect(db.update).not.toHaveBeenCalled();
    db.findUnique.mockResolvedValue(account({ passwordHash: null }));
    await rondgangWerkgever(RONDGANG_WERKGEVER_STANDAARD, "x".repeat(32));
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.update.mock.calls[0]![0].where).toEqual({ id: "u_wg" });
  });

  it("een account met een andere rol of een ander bedrijf: overgeslagen, wachtwoord niet aangeraakt", async () => {
    db.findUnique.mockResolvedValue(account({ passwordHash: null, memberships: [...testRol, { role: "PLATFORM_ADMIN", tenant: { name: "ZekerFlex" } }] }));
    expect(await rondgangWerkgever(RONDGANG_WERKGEVER_STANDAARD, "x".repeat(32))).toEqual({ reden: expect.stringMatching(/PLATFORM_ADMIN/) });
    db.findUnique.mockResolvedValue(account({ passwordHash: null, emailVerifiedAt: null }));
    expect(await rondgangWerkgever(RONDGANG_WERKGEVER_STANDAARD, "x".repeat(32))).toEqual({ reden: expect.stringMatching(/niet bevestigd/) });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("draaiWerkgeverRondgang", () => {
  it("zonder wachtwoord: overgeslagen, niets opgehaald", async () => {
    e.env.RONDGANG_WERKGEVER_PASS = undefined;
    expect(await draaiWerkgeverRondgang(1, "http://app:3000")).toEqual({ ingelogd: false, paginas: 0, overgeslagen: "geen RONDGANG_WERKGEVER_PASS", problemen: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("meldt zich aan, haalt elke pagina intern op met alleen GET en noemt alleen echte problemen; de sessie staat nergens in de uitslag", async () => {
    db.findUnique.mockResolvedValue(account());
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/auth/csrf")) return antwoord(200, JSON.stringify({ csrfToken: "c1" }));
      if (url.endsWith("/api/auth/callback/credentials")) {
        expect(String(init?.body)).toContain(encodeURIComponent("https://zekerflex.com/werkgever"));
        return antwoord(302, "", { location: "https://zekerflex.com/werkgever" }, [`${SESSION_COOKIE}=${GEHEIM}; Path=/; HttpOnly; Secure`]);
      }
      expect(init?.method ?? "GET").toBe("GET");
      const koppen = init?.headers as Record<string, string>;
      expect(koppen["x-forwarded-host"]).toBe("zekerflex.com");
      expect(koppen["user-agent"]).toMatch(/werkgever/);
      expect(koppen.cookie).toContain(GEHEIM);
      if (url.endsWith("/werkgever/facturen")) return antwoord(500, "fout", { "content-type": "text/html" });
      if (url.endsWith("/werkgever/team")) return antwoord(307, "", { location: "/dashboard" });
      if (url.endsWith("/werkgever/kalender")) return antwoord(307, "", { location: "/werkgever/agenda" });
      return antwoord(200, PAGINA, { "content-type": "text/html; charset=utf-8" });
    });
    const uit = await draaiWerkgeverRondgang(2, "http://app:3000");
    expect(uit.ingelogd).toBe(true);
    expect(uit.paginas).toBe(WERKGEVER_PAGINAS.length);
    expect(uit.problemen.map((p) => p.route)).toEqual(["/werkgever/facturen", "/werkgever/team"]);
    expect(uit.problemen[1]?.reden).toMatch(/werkersapp/);
    expect(JSON.stringify(uit)).not.toContain(GEHEIM);
  });

  it("stopt na een 403 (geen reeks 403's voor CrowdSec)", async () => {
    db.findUnique.mockResolvedValue(account());
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/csrf")) return antwoord(200, JSON.stringify({ csrfToken: "c1" }));
      if (url.endsWith("/api/auth/callback/credentials")) return antwoord(302, "", {}, [`${SESSION_COOKIE}=${GEHEIM}; Path=/`]);
      return antwoord(403, "nee");
    });
    const uit = await draaiWerkgeverRondgang(1, "http://app:3000");
    expect(uit.overgeslagen).toBe("gestopt na een 403");
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).includes("/api/auth/")).length).toBe(1);
  });
});

describe("in de rondgang en het paneel", () => {
  it("de uitslag krijgt een werkgeversdeel, kapotte pagina's gaan als werkgeverpagina kapot naar het foutenlogboek, en het paneel noemt het", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    const rondgang = lees("lib/ops/rondgang.ts");
    expect(rondgang).toMatch(/journal\("error", "werkgeverpagina kapot"/);
    expect(rondgang).toMatch(/werkgever: \{ ingelogd: wg\.ingelogd, paginas: wg\.paginas/);
    expect(lees("components/admin/RondgangPanel.tsx")).toMatch(/werkgeverspagina's, als de vaste testwerkgever/);
    expect(lees("deploy/scripts/env-aanvullen.sh")).toMatch(/RONDGANG_WERKER_PASS RONDGANG_WERKGEVER_PASS; do/);
  });
});
