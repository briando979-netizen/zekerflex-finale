import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// /login voor wie al ingelogd is (13 nov): van de nieuwe werkers met /login als laatste pagina waren er twee nog
// ingelogd (terugknop na het inloggen, "Inloggen" in de kop, de knop in de welkomstmail). Nu: met een volledige
// sessie door naar het doel; een half of kapot cookie (gewist of uitgeschakeld account, ongeldig token) houdt het
// formulier, anders ontstaat er een lus met de layouts die zonder sessie naar /login sturen. Na het inloggen
// vervangt de stap /login in de geschiedenis (replace), zodat de terugknop er niet meer op uitkomt.
// ---------------------------------------------------------------------------

const decodeSessionMock = vi.fn();
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, decodeSession: (...a: unknown[]) => decodeSessionMock(...a) };
});
const userFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: (...a: unknown[]) => userFindFirst(...a) } } }));
const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (...a: unknown[]) => cookieGet(...a) }),
  headers: () => ({ get: () => null }),
}));

import { getPrincipal } from "@/lib/auth";
import { doelAlIngelogd, doorsturenAlsIngelogd } from "@/lib/auth/al-ingelogd";

const bron = (pad: string) => readFileSync(pad, "utf8").replace(/\r\n/g, "\n");
/** Wat /login doet bij dit cookie: het doel, of null voor het formulier (zoals app/login/page.tsx het vraagt). */
const loginDoet = async (zoek: { callbackUrl?: string; error?: string } = {}) =>
  doorsturenAlsIngelogd((await getPrincipal()) !== null, zoek);

beforeEach(() => {
  decodeSessionMock.mockReset();
  userFindFirst.mockReset();
  cookieGet.mockReset();
  cookieGet.mockReturnValue({ value: "een.jwt.token" });
});

describe("/login met een cookie", () => {
  it("geen cookie of een ongeldig/verlopen token: het formulier", async () => {
    cookieGet.mockReturnValue(undefined);
    decodeSessionMock.mockResolvedValue(null);
    expect(await loginDoet()).toBeNull();
    cookieGet.mockReturnValue({ value: "kapot" });
    expect(await loginDoet({ callbackUrl: "/dashboard" })).toBeNull();
  });

  it("een geldig token van een gewist of uitgeschakeld account: het formulier, geen doorsturen", async () => {
    decodeSessionMock.mockResolvedValue({ sub: "usr_weg", email: "x@zf.test", name: "X", roles: [] });
    userFindFirst.mockResolvedValue(null); // gewist, of disabledAt gezet (de vraag eist disabledAt: null)
    expect(await loginDoet()).toBeNull();
    expect(await loginDoet({ callbackUrl: "/dashboard/klussen" })).toBeNull();
    expect(userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ disabledAt: null }) }));
  });

  it("een volledige sessie: door naar het doel, of /start (die kiest per rol)", async () => {
    decodeSessionMock.mockResolvedValue({ sub: "usr_1", email: "w@zf.test", name: "W", roles: [] });
    userFindFirst.mockResolvedValue({ id: "usr_1", email: "w@zf.test", fullName: "W", emailVerifiedAt: new Date("2026-11-01T10:00:00+01:00"), memberships: [] });
    expect(await loginDoet()).toBe("/start");
    expect(await loginDoet({ callbackUrl: "/dashboard/klussen?tab=dichtbij" })).toBe("/dashboard/klussen?tab=dichtbij");
    // met een foutmelding in het adres blijft het formulier staan (anders ziet niemand die melding)
    expect(await loginDoet({ error: "OAuthAccountNotLinked" })).toBeNull();
  });
});

describe("doelAlIngelogd", () => {
  it("zonder of met een vreemd doel: /start", () => {
    for (const raar of [undefined, "", "https://kwaad.example", "//kwaad.example", "/\\kwaad.example", "/a\\b", "/\t/kwaad.example", "/\n/kwaad.example", "/ /x", "dashboard"]) {
      expect(doelAlIngelogd(raar), String(raar)).toBe("/start");
    }
  });
  it("nooit terug naar een inlogscherm (geen lus)", () => {
    for (const lus of ["/login", "/login?callbackUrl=/login", "/login/", "/register", "/welkom", "/wachtwoord-vergeten", "/wachtwoord-herstellen?token=x", "/login#x"]) {
      expect(doelAlIngelogd(lus), lus).toBe("/start");
    }
    // een pad dat alleen zo begint, is gewoon een doel
    expect(doelAlIngelogd("/loginhulp")).toBe("/loginhulp");
  });
  it("een eigen pad blijft het doel, met zoekdeel", () => {
    expect(doelAlIngelogd("/werkgever")).toBe("/werkgever");
    expect(doelAlIngelogd("/berichten?gesprek=abc")).toBe("/berichten?gesprek=abc");
    expect(doelAlIngelogd("/admin")).toBe("/admin");
  });
});

describe("de pagina en de inlogacties", () => {
  it("/login vraagt getPrincipal (de databasecontrole), stuurt door vóór het formulier en telt zonder gebruiker", () => {
    const s = bron("app/login/page.tsx");
    expect(s).toMatch(/doorsturenAlsIngelogd\(\(await getPrincipal\(\)\) !== null, searchParams\)/);
    expect(s.indexOf("redirect(doel)")).toBeGreaterThan(0);
    expect(s.indexOf("redirect(doel)")).toBeLessThan(s.indexOf("<LoginForm"));
    expect(s).toMatch(/recordServerEvent\(\{ path: "\/login", label: "al-ingelogd" \}\)/);
    // een prefetch van <Link href="/login"> telt niet mee
    expect(s).toContain('has("next-router-prefetch")');
  });

  it("elke inlogweg vervangt de stap in de geschiedenis (replace, geen push)", () => {
    const s = bron("app/login/actions.ts");
    const aanroepen = s.match(/signIn\("(credentials|passkey|google|apple)"[^;]*;/g) ?? [];
    expect(aanroepen.length).toBe(5); // tweestap, wachtwoord, passkey, Google, Apple
    for (const a of aanroepen) expect(a, a.slice(0, 40)).toContain("redirect: false");
    expect(s).toContain("redirect(typeof doel === \"string\" && doel ? doel : \"/start\", RedirectType.replace)");
    expect((s.match(/naarDoel\(/g) ?? []).length).toBe(6); // de functie zelf + vijf inlogwegen
  });
});
