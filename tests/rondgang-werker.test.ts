import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Het werkerdeel van de nachtelijke rondgang (12 nov 2026, eisen 86): een vaste .test-werker, de gewone aanmelding,
// alleen GET, de sessie alleen in het geheugen, en zorgVoorRondgangWerker raakt nooit een ander account.

const e = vi.hoisted(() => ({ env: { APP_BASE_URL: "https://zekerflex.com", RONDGANG_WERKER_PASS: "x".repeat(32) as string | undefined, RONDGANG_WERKER_EMAIL: undefined as string | undefined } }));
vi.mock("@/lib/env", () => ({ env: e.env }));
const db = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => db.findUnique(...a), create: (...a: unknown[]) => db.create(...a), update: (...a: unknown[]) => db.update(...a) },
    membership: { create: (...a: unknown[]) => db.membership(...a) },
  },
}));
const setFiscal = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({ setFiscal: (...a: unknown[]) => setFiscal(...a) }));

import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { RONDGANG_WERKER_STANDAARD, WERKER_PAGINAS, draaiWerkerRondgang, redirectPad, zorgVoorRondgangWerker } from "@/lib/ops/rondgang-werker";

const GEHEIM = "sessie-waarde-die-nergens-mag-staan";

interface Nep {
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}
const antwoord = (status: number, body = "", koppen: Record<string, string> = {}, cookies: string[] = []): Nep => {
  const headers = new Headers(koppen);
  for (const c of cookies) headers.append("set-cookie", c);
  return { status, headers, json: async () => JSON.parse(body || "{}"), text: async () => body };
};
const PAGINA = `<html><body><main>${"Een gewone werkerpagina met genoeg tekst. ".repeat(20)}</main></body></html>`;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  e.env.RONDGANG_WERKER_PASS = "x".repeat(32);
  e.env.RONDGANG_WERKER_EMAIL = undefined;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("de pagina's", () => {
  it("bestaan allemaal, zijn vast en horen bij de werker-app; geen betaalde of externe diensten", () => {
    const vast = new Set(APP_PAGES.filter((p) => !p.dynamic).map((p) => p.route));
    for (const p of WERKER_PAGINAS) {
      expect(vast.has(p), p).toBe(true);
      expect(p.startsWith("/dashboard/")).toBe(true);
    }
    for (const nee of ["/dashboard/uitbetalingen", "/dashboard/bank", "/dashboard/assistent", "/dashboard/incheck", "/dashboard/inchecken"]) {
      expect(WERKER_PAGINAS as readonly string[]).not.toContain(nee);
    }
  });
});

describe("zorgVoorRondgangWerker", () => {
  it("weigert elk adres dat niet op een testdomein eindigt, en een te kort wachtwoord; dan geen databasewerk", async () => {
    expect(await zorgVoorRondgangWerker("rondgang@zekerflex.com", "x".repeat(32))).toBeNull();
    expect(await zorgVoorRondgangWerker("eigenaar@gmail.com", "x".repeat(32))).toBeNull();
    expect(await zorgVoorRondgangWerker(RONDGANG_WERKER_STANDAARD, "kort")).toBeNull();
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("maakt alleen dat ene .test-account aan, als werker, met een hash van het wachtwoord", async () => {
    db.findUnique.mockResolvedValue(null);
    db.create.mockResolvedValue({ id: "u_rondgang" });
    expect(await zorgVoorRondgangWerker(" Rondgang@Zekerflex.TEST ", "w".repeat(24))).toEqual({ id: "u_rondgang" });
    expect(db.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "rondgang@zekerflex.test" } }));
    const data = db.create.mock.calls[0]![0].data as { email: string; passwordHash: string };
    expect(data.email).toBe("rondgang@zekerflex.test");
    expect(await bcrypt.compare("w".repeat(24), data.passwordHash)).toBe(true);
    expect(db.membership).toHaveBeenCalledWith({ data: { userId: "u_rondgang", tenantId: "org_platform", role: "FREELANCER" } });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("bestaat het al: alleen de hash bijwerken als het wachtwoord veranderde, op precies dat adres", async () => {
    db.findUnique.mockResolvedValue({ id: "u1", passwordHash: await bcrypt.hash("w".repeat(24), 4) });
    await zorgVoorRondgangWerker(RONDGANG_WERKER_STANDAARD, "w".repeat(24));
    expect(db.update).not.toHaveBeenCalled();
    await zorgVoorRondgangWerker(RONDGANG_WERKER_STANDAARD, "n".repeat(24));
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.update.mock.calls[0]![0].where).toEqual({ email: RONDGANG_WERKER_STANDAARD });
    expect(db.create).not.toHaveBeenCalled();
  });
});

describe("draaiWerkerRondgang", () => {
  const klaarAccount = () => db.findUnique.mockResolvedValue({ id: "u1", passwordHash: bcrypt.hashSync("x".repeat(32), 4) });
  const aanmelden = (sessie = true) => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/auth/csrf")) return antwoord(200, JSON.stringify({ csrfToken: "c1" }), {}, ["__Host-authjs.csrf-token=csrf; Path=/"]);
      if (url.endsWith("/api/auth/callback/credentials")) {
        expect(init?.method).toBe("POST");
        return antwoord(302, "", { location: "https://zekerflex.com/dashboard/klussen" }, sessie ? [`${SESSION_COOKIE}=${GEHEIM}; Path=/; HttpOnly; Secure`] : ["__Secure-authjs.callback-url=x; Path=/"]);
      }
      // werkerpagina's: alleen GET, met de sessie en de koppen zoals Caddy
      expect(init?.method ?? "GET").toBe("GET");
      const koppen = init?.headers as Record<string, string>;
      expect(koppen["x-forwarded-host"]).toBe("zekerflex.com");
      expect(koppen.cookie).toContain(GEHEIM);
      if (url.endsWith("/dashboard/uren")) return antwoord(500, "fout", { "content-type": "text/html" });
      if (url.endsWith("/dashboard/fiscaal")) return antwoord(307, "", { location: "/login?callbackUrl=%2Fdashboard%2Ffiscaal" });
      if (url.endsWith("/dashboard/account")) return antwoord(307, "", { location: "/dashboard/account/profiel" });
      return antwoord(200, PAGINA, { "content-type": "text/html; charset=utf-8" });
    });
  };

  it("zonder wachtwoord: overgeslagen, niets opgehaald", async () => {
    e.env.RONDGANG_WERKER_PASS = undefined;
    expect(await draaiWerkerRondgang(1, "http://app:3000")).toEqual({ ingelogd: false, paginas: 0, overgeslagen: "geen RONDGANG_WERKER_PASS", problemen: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("een ander adres dan een testadres: overgeslagen", async () => {
    e.env.RONDGANG_WERKER_EMAIL = "iemand@zekerflex.com";
    expect((await draaiWerkerRondgang(1, "http://app:3000")).overgeslagen).toMatch(/testdomein/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("meldt zich aan, haalt elke pagina intern op en noemt alleen echte problemen; de sessie staat nergens in de uitslag", async () => {
    klaarAccount();
    aanmelden();
    const uit = await draaiWerkerRondgang(2, "http://app:3000");
    expect(uit.ingelogd).toBe(true);
    expect(uit.paginas).toBe(WERKER_PAGINAS.length);
    expect(uit.problemen).toEqual([
      { route: "/dashboard/fiscaal", status: 307, reden: "stuurt de werker naar het inloggen (uitgelogd)" },
      { route: "/dashboard/uren", status: 500, reden: "serverfout 500" },
    ]);
    // alles intern, nooit via de publieke url
    for (const [url] of fetchMock.mock.calls as [string][]) expect(url.startsWith("http://app:3000/")).toBe(true);
    expect(JSON.stringify(uit)).not.toContain(GEHEIM);
  });

  it("inloggen mislukt: één melding, geen werkerpagina's", async () => {
    klaarAccount();
    aanmelden(false);
    const uit = await draaiWerkerRondgang(1, "http://app:3000");
    expect(uit).toMatchObject({ ingelogd: false, overgeslagen: "inloggen mislukt" });
    expect(uit.problemen).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("na een 403 stopt het werkerdeel (geen reeks 403's)", async () => {
    klaarAccount();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/csrf")) return antwoord(200, JSON.stringify({ csrfToken: "c1" }));
      if (url.endsWith("/api/auth/callback/credentials")) return antwoord(302, "", { location: "/dashboard" }, [`${SESSION_COOKIE}=${GEHEIM}`]);
      return antwoord(403, "nee", { "content-type": "text/html" });
    });
    const uit = await draaiWerkerRondgang(1, "http://app:3000");
    expect(uit.overgeslagen).toMatch(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("redirectPad leest absolute en relatieve adressen", () => {
    expect(redirectPad("https://zekerflex.com/login?x=1")).toBe("/login");
    expect(redirectPad("/dashboard/klussen#a")).toBe("/dashboard/klussen");
  });
});
