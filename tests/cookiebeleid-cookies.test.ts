import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// /cookiebeleid §6 (14 nov 2026): per cookie de echte naam, het doel en de looptijd. Vroeger drie soorten zonder looptijd,
// "tijdens je bezoek" voor een inlog van 8 uur of 30 dagen, en een doorverwijscookie die nergens stond. Deze test houdt de
// lijst (lib/privacy/cookies.ts) gelijk aan de code, zoals tests/bezoekstatistiek-bewaren.test.ts dat voor de termijn doet:
// een andere looptijd, een nieuwe cookie of een nieuwe plek die een cookie zet, laat hem falen.

const h = vi.hoisted(() => ({ userForCode: vi.fn(async (_code: string) => "u1" as string | null) }));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/rewards/referral", () => ({ REF_COOKIE: "zf_ref", userForCode: (code: string) => h.userForCode(code) }));

import { BANK_AAN } from "@/lib/app-mode";
import { GEPLAATSTE_COOKIES, cookieRegel, cookiesNu, looptijdTekst, type Looptijd } from "@/lib/privacy/cookies";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const DAG = 86_400;

/** "60 * 60 * 24 * 365" of "30 * 86_400" → seconden; alleen getallen en keer. */
function reken(expr: string): number {
  const delen = expr.split("*").map((d) => Number(d.trim().replace(/_/g, "")));
  if (delen.length === 0 || delen.some((d) => !Number.isFinite(d))) throw new Error(`geen som: ${expr}`);
  return delen.reduce((a, b) => a * b, 1);
}
function uit(bestand: string, patroon: RegExp): number {
  const m = lees(bestand).match(patroon);
  if (!m?.[1]) throw new Error(`${bestand}: ${patroon} niet gevonden`);
  return reken(m[1]);
}
const constante = (bestand: string, naam: string) => uit(bestand, new RegExp(`const ${naam}\\s*=\\s*([\\d_\\s*]+);`));
const SOM = "([\\d_\\s*]+)";

interface Verwacht {
  /** het bestand waar de naam als tekst staat */
  bron: string;
  looptijd: () => Looptijd;
  anders?: () => Looptijd;
}

const NEXTAUTH = "lib/auth/nextauth.ts";
const VERWACHT: Record<string, Verwacht> = {
  "__Secure-zekerflex.session": {
    bron: "lib/auth/session.ts",
    looptijd: () => constante("lib/auth/session.ts", "SESSION_MAX_AGE_SECONDS"),
    anders: () => constante("lib/auth/session.ts", "REMEMBER_MAX_AGE_SECONDS"),
  },
  "__Secure-authjs.state": { bron: NEXTAUTH, looptijd: () => uit(NEXTAUTH, new RegExp(`terugPostCookie\\("state",\\s*${SOM}\\)`)) },
  "__Secure-authjs.nonce": { bron: NEXTAUTH, looptijd: () => uit(NEXTAUTH, new RegExp(`terugPostCookie\\("nonce",\\s*${SOM}\\)`)) },
  "__Secure-authjs.pkce.code_verifier": { bron: NEXTAUTH, looptijd: () => uit(NEXTAUTH, new RegExp(`terugPostCookie\\("pkce\\.code_verifier",\\s*${SOM}\\)`)) },
  // zonder maxAge = weg bij het sluiten van de browser
  "__Secure-authjs.callback-url": { bron: NEXTAUTH, looptijd: () => (lees(NEXTAUTH).includes('terugPostCookie("callback-url")') ? "sessie" : -1) },
  // de standaard van NextAuth (sessiecookie); alleen zolang wij hem niet zelf instellen
  "__Host-authjs.csrf-token": { bron: NEXTAUTH, looptijd: () => (lees(NEXTAUTH).includes("csrfToken") ? -1 : "sessie") },
  zf_passkey: { bron: "lib/auth/passkey/uitdaging.ts", looptijd: () => constante("lib/auth/passkey/uitdaging.ts", "UITDAGING_SECONDEN") },
  zf_cookie_consent: { bron: "components/marketing/CookieConsent.tsx", looptijd: () => constante("components/marketing/CookieConsent.tsx", "oneYear") },
  zf_locale: { bron: "lib/i18n/config.ts", looptijd: () => constante("lib/i18n/config.ts", "LOCALE_MAX_AGE") },
  zf_theme: { bron: "lib/theme/config.ts", looptijd: () => constante("lib/theme/config.ts", "THEME_MAX_AGE") },
  zf_dashboard: { bron: "lib/werkgever/werkruimte-server.ts", looptijd: () => uit("lib/werkgever/werkruimte-server.ts", new RegExp(`name: DASHBOARD_COOKIE,[^}]*maxAge: ${SOM},`)) },
  zf_shop_modus: { bron: "lib/shop/modus.ts", looptijd: () => constante("lib/shop/modus.ts", "MODUS_MAX_AGE") },
  zf_welkom: { bron: "lib/welkom/slides.ts", looptijd: () => uit("lib/welkom/slides.ts", new RegExp(`WELKOM_COOKIE\\}=1; path=/; max-age=\\$\\{${SOM}\\}`)) },
  zf_balk_dicht: { bron: "lib/ontwerp/balk.ts", looptijd: () => uit("components/marketing/AankondigingsBalk.tsx", new RegExp(`BALK_COOKIE\\}=\\$\\{id\\}; Max-Age=\\$\\{${SOM}\\}`)) },
  zf_app: { bron: "lib/app-mode.ts", looptijd: () => uit("middleware.ts", new RegExp(`res\\.cookies\\.set\\(APP_COOKIE, "1", \\{ path: "/", maxAge: ${SOM},`)) },
  zf_app_ios: { bron: "lib/app-mode.ts", looptijd: () => uit("middleware.ts", new RegExp(`res\\.cookies\\.set\\(APP_IOS_COOKIE, "1", \\{ path: "/", maxAge: ${SOM},`)) },
  zf_app_chip: { bron: "lib/app-mode.ts", looptijd: () => uit("middleware.ts", new RegExp(`res\\.cookies\\.set\\(APP_CHIP_COOKIE, "1", \\{ path: "/", maxAge: ${SOM},`)) },
  zf_taal_geteld: {
    bron: "lib/i18n/taal-vraag.ts",
    looptijd: () => {
      const zet = lees("app/api/analytics/taal-vraag/route.ts").match(/res\.cookies\.set\(TAALVRAAG_COOKIE[^)]*\)/)?.[0] ?? "";
      return zet && !zet.includes("maxAge") && !zet.includes("expires") ? "sessie" : -1;
    },
  },
  zf_horeca_scherm: { bron: "lib/horeca/apparaten.ts", looptijd: () => constante("lib/horeca/apparaten.ts", "COOKIE_DAGEN") * DAG },
  zf_rijles: { bron: "lib/rijschool/accounts.ts", looptijd: () => constante("lib/rijschool/accounts.ts", "SESSIE_DAGEN") * DAG },
  zf_view_as: { bron: "lib/auth/inspect.ts", looptijd: () => constante("lib/auth/inspect.ts", "INSPECT_SESSION_SECONDS") },
  schw_sessie: { bron: "lib/voorstel/schwarzwald-accounts.ts", looptijd: () => constante("lib/voorstel/schwarzwald-accounts.ts", "SESSIE_DAGEN") * DAG },
  schw_google: { bron: "lib/voorstel/google.ts", looptijd: () => uit("app/api/voorstel/schwarzwald/google/route.ts", new RegExp(`maxAge: ${SOM},`)) },
  zf_ref: { bron: "lib/rewards/referral.ts", looptijd: () => uit("app/r/[code]/route.ts", new RegExp(`maxAge: ${SOM},`)) },
};

// Elke plek in de code die een cookie zet (of wist), met het aantal keer. Klantsites (lib/sites) staan op hun eigen domein.
const ZETTERS: Record<string, number> = {
  "lib/auth/nextauth.ts": 4,
  "middleware.ts": 6,
  "app/api/admin/view-as/route.ts": 1,
  "app/api/analytics/taal-vraag/route.ts": 1,
  "app/api/auth/passkey/route.ts": 1,
  "app/api/voorstel/schwarzwald/google/route.ts": 1,
  "app/api/voorstel/schwarzwald/google/terug/route.ts": 2,
  "app/api/werkgever/dashboard/wissel/route.ts": 1,
  "app/api/werkgever/werkruimte/route.ts": 1,
  "app/r/[code]/route.ts": 1,
  "components/i18n/I18nProvider.tsx": 1,
  "components/marketing/AankondigingsBalk.tsx": 1,
  "components/marketing/CookieConsent.tsx": 1,
  "components/marketing/ShopModus.tsx": 1,
  "components/theme/ThemeToggle.tsx": 1,
  "components/welkom/WelkomCarousel.tsx": 1,
  "lib/horeca/apparaten.ts": 1,
  "lib/rijschool/accounts.ts": 1,
  "lib/voorstel/schwarzwald-accounts.ts": 1,
};
// req.cookies.set (alleen het verzoek, niet de browser) telt niet mee
const ZET_PATRONEN = [/\b(?!req\.)\w+\.cookies\.set\(/g, /cookies\(\)\)?\.set\(/g, /document\.cookie\s*=(?!=)/g, /["']set-cookie["']/gi, /cookieStore\.set\(/g, /terugPostCookie\("/g];

function bronbestanden(): string[] {
  const uitkomst: string[] = ["middleware.ts"];
  for (const map of ["app", "lib", "components"]) {
    for (const f of readdirSync(path.join(process.cwd(), map), { recursive: true }) as string[]) {
      const rel = `${map}/${f.split(path.sep).join("/")}`;
      if (/\.(ts|tsx)$/.test(rel) && !rel.startsWith("lib/sites/")) uitkomst.push(rel);
    }
  }
  return uitkomst;
}

afterEach(() => {
  vi.doUnmock("@/lib/app-mode");
  vi.resetModules();
  h.userForCode.mockClear();
});

describe("de cookielijst klopt met de code", () => {
  it("elke cookie in de lijst: de naam staat in de code en de looptijd is die uit de code", () => {
    for (const c of GEPLAATSTE_COOKIES) {
      for (const naam of c.namen) {
        const v = VERWACHT[naam];
        expect(v, `${naam} heeft geen controle in deze test`).toBeDefined();
        if (!v) continue;
        const kort = naam.replace(/^__(Secure|Host)-/, "");
        const tekst = kort.startsWith("authjs.") ? "authjs." : `"${kort}"`;
        expect(lees(v.bron), `${naam} in ${v.bron}`).toContain(tekst);
        expect(c.looptijd, naam).toBe(v.looptijd());
        if (v.anders) expect(c.anders?.looptijd, `${naam} (anders)`).toBe(v.anders());
      }
    }
    expect(lees("lib/auth/session.ts")).toContain('"__Secure-zekerflex.session"');
    expect(lees(NEXTAUTH)).toContain('name: `${PROD ? "__Secure-" : ""}authjs.${naam}`');
  });

  it("geen controle zonder cookie in de lijst", () => {
    const namen = new Set(GEPLAATSTE_COOKIES.flatMap((c) => c.namen));
    for (const naam of Object.keys(VERWACHT)) expect(namen.has(naam), naam).toBe(true);
  });

  it("geen nieuwe plek die een cookie zet zonder dat hij in de lijst komt", () => {
    const gevonden: Record<string, number> = {};
    for (const f of bronbestanden()) {
      const s = lees(f);
      const n = ZET_PATRONEN.reduce((som, p) => som + (s.match(p)?.length ?? 0), 0);
      if (n > 0) gevonden[f] = n;
    }
    expect(gevonden).toEqual(ZETTERS);
  });
});

describe("de pagina", () => {
  it("toont de lijst van nu, met looptijden; de oude vage regel is weg", () => {
    const s = lees("app/(marketing)/cookiebeleid/page.tsx");
    expect(s).toContain("list={cookiesNu().map(cookieRegel)}");
    expect(s).not.toContain("tijdens je bezoek");
    expect(s).not.toContain("uitsluitend strikt noodzakelijke");
    expect(cookieRegel(GEPLAATSTE_COOKIES[0]!)).toBe('__Secure-zekerflex.session: houdt je ingelogd. Looptijd: 8 uur, of 30 dagen als je "ingelogd blijven" kiest.');
  });

  it("looptijden in gewone woorden", () => {
    expect(looptijdTekst("sessie")).toBe("tot je de browser sluit");
    expect(looptijdTekst(365 * DAG)).toBe("1 jaar");
    expect(looptijdTekst(60 * DAG)).toBe("60 dagen");
    expect(looptijdTekst(DAG)).toBe("1 dag");
    expect(looptijdTekst(2 * 3600)).toBe("2 uur");
    expect(looptijdTekst(15 * 60)).toBe("15 minuten");
  });

  it("de doorverwijscookie staat er alleen in als de doorverwijsbonus aan staat", () => {
    expect(cookiesNu().some((c) => c.namen.includes("zf_ref"))).toBe(BANK_AAN);
    expect(GEPLAATSTE_COOKIES.some((c) => c.namen.includes("zf_ref"))).toBe(true);
  });
});

describe("/r/<code>", () => {
  const vraag = async () => {
    const { GET } = await import("@/app/r/[code]/route");
    return GET(new Request("https://zekerflex.test/r/abc"), { params: Promise.resolve({ code: "abc" }) });
  };

  it("bonus uit: alleen door naar aanmelden, geen cookie en geen opzoeking", async () => {
    vi.doMock("@/lib/app-mode", () => ({ BANK_AAN: false }));
    const res = await vraag();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://zekerflex.test/register");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.userForCode).not.toHaveBeenCalled();
  });

  it("bonus aan: de cookie komt terug, 30 dagen", async () => {
    vi.doMock("@/lib/app-mode", () => ({ BANK_AAN: true }));
    const res = await vraag();
    expect(res.headers.get("set-cookie")).toMatch(/^zf_ref=ABC;.*Max-Age=2592000/);
  });
});
