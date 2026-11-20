import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { resolvePeriod } from "@/lib/admin/period";
import {
  SECTIES,
  actieveAccountsPerDag,
  dekking,
  perGebruiker,
  scrolDiepte,
  sectieVan,
  telMeerdereDagen,
  telTerugkomers,
  tijdlijnPerDag,
  tijdlijnVan,
  topLabels,
  uurVerdeling,
  volgendeNaVoorpagina,
  type EventRij,
  type LoginRij,
} from "@/lib/analytics/meetkamer-kern";

// De Meetkamer (20 nov 2026): per gebruiker inlogs, terugkomers, gedrag en dekking. Tijden zijn in Nederlandse tijd en
// de klok staat vast (anders worden deze tests tijdbommen in UTC op de live-controle).

const NU = new Date("2026-11-20T10:00:00+01:00");
const t = (s: string) => new Date(s);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

const logins: LoginRij[] = [
  { userId: "a", at: t("2026-11-18T07:30:00+01:00"), ok: true },
  { userId: "a", at: t("2026-11-19T23:40:00+01:00"), ok: true }, // 23:40 NL = 22:40 UTC: hoort bij 19 nov en uur 23
  { userId: "a", at: t("2026-11-20T08:05:00+01:00"), ok: false },
  { userId: "b", at: t("2026-11-20T09:00:00+01:00"), ok: true },
];
const events: EventRij[] = [
  { userId: "a", sessionId: "s1", path: "/", type: "PAGEVIEW", label: null, at: t("2026-11-19T23:41:00+01:00") },
  { userId: "a", sessionId: "s1", path: "/dashboard", type: "PAGEVIEW", label: null, at: t("2026-11-19T23:42:00+01:00") },
  { userId: "a", sessionId: "s1", path: "/dashboard", type: "CLICK", label: "Klussen", at: t("2026-11-19T23:43:00+01:00") },
  { userId: "b", sessionId: "s2", path: "/werkgever", type: "PAGEVIEW", label: null, at: t("2026-11-20T09:01:00+01:00") },
  { userId: null, sessionId: "gast", path: "/", type: "CLICK", label: "Start vandaag", at: t("2026-11-20T09:30:00+01:00") },
];

describe("meetkamer: per gebruiker", () => {
  it("telt inlogs, mislukte pogingen, gedrag, sessies en dagen in Nederlandse tijd", () => {
    const s = perGebruiker(logins, events);
    const a = s.get("a")!;
    expect(a.logins).toBe(2);
    expect(a.mislukt).toBe(1);
    expect(a.paginas).toBe(2);
    expect(a.kliks).toBe(1);
    expect(a.sessies).toBe(1);
    expect(a.dagenActief).toBe(3); // 18, 19 en 20 nov (de mislukte poging telt als dag)
    expect(a.laatstePad).toBe("/dashboard");
    expect(a.eersteLogin?.toISOString()).toBe("2026-11-18T06:30:00.000Z");
    expect(s.get("b")!.logins).toBe(1);
    expect(s.has("gast")).toBe(false);
  });

  it("terugkomers = 2 of meer inlogs; meerdere dagen = 2 of meer dagen", () => {
    const s = perGebruiker(logins, events);
    expect(telTerugkomers(s.values())).toBe(1);
    expect(telMeerdereDagen(s.values())).toBe(1);
  });

  it("verdeelt per uur in Nederlandse tijd (23:40 NL hoort bij uur 23, niet bij 22)", () => {
    const uren = uurVerdeling(logins.filter((l) => l.ok).map((l) => l.at));
    expect(uren).toHaveLength(24);
    expect(uren[23]).toBe(1);
    expect(uren[22]).toBe(0);
    expect(uren[7]).toBe(1);
    expect(uren[9]).toBe(1);
  });

  it("actieve accounts per dag: de laatste dag telt b en de nacht van 19 nov telt a", () => {
    const period = resolvePeriod("7", 30, NU);
    const reeks = actieveAccountsPerDag(logins, events, period);
    expect(reeks).toHaveLength(7);
    expect(reeks[6]).toBe(1); // 20 nov: b (a's poging mislukte, maar a deed niets)
    expect(reeks[5]).toBe(1); // 19 nov: a
  });
});

describe("meetkamer: tijdlijn", () => {
  it("zet inlogs, pagina's, kliks en acties op één lijn, nieuwste eerst, per dag", () => {
    const audit = [
      { id: "1", action: "auth.login.succeeded", summary: "Ingelogd", at: t("2026-11-19T23:40:00+01:00") },
      { id: "2", action: "auth.login.failed", summary: "", at: t("2026-11-20T08:05:00+01:00") },
      { id: "3", action: "timesheet.submitted", summary: "Uren ingediend", at: t("2026-11-20T08:10:00+01:00") },
    ];
    const lijn = tijdlijnVan(audit, events.filter((e) => e.userId === "a"));
    expect(lijn[0]?.tekst).toBe("Uren ingediend");
    expect(lijn.map((i) => i.soort)).toEqual(["actie", "login-mislukt", "klik", "pagina", "pagina", "login"]);
    const dagen = tijdlijnPerDag(lijn);
    expect(dagen.map((d) => d.dag)).toEqual(["2026-11-20", "2026-11-19"]);
    expect(dagen[1]?.items).toHaveLength(4);
  });
});

describe("meetkamer: voorpagina en dekking", () => {
  it("top-kliks met aandeel, scroldiepte en de volgende pagina na de voorpagina", () => {
    expect(topLabels([{ label: "Start", count: 3 }, { label: null, count: 5 }, { label: "Inloggen", count: 1 }])).toEqual([
      { label: "Start", count: 3, aandeel: 33 },
      { label: "Inloggen", count: 1, aandeel: 11 },
    ]);
    expect(scrolDiepte([{ label: "scroll:50", count: 4 }, { label: "scroll:25", count: 9 }])).toEqual([
      { diepte: 25, count: 9 },
      { diepte: 50, count: 4 },
      { diepte: 75, count: 0 },
      { diepte: 100, count: 0 },
    ]);
    const paginas = [
      { sessionId: "x", path: "/", at: t("2026-11-20T09:00:00+01:00") },
      { sessionId: "x", path: "/register", at: t("2026-11-20T09:01:00+01:00") },
      { sessionId: "x", path: "/login", at: t("2026-11-20T09:02:00+01:00") },
      { sessionId: "y", path: "/prijzen", at: t("2026-11-20T09:00:00+01:00") },
      { sessionId: "y", path: "/", at: t("2026-11-20T09:03:00+01:00") },
      { sessionId: "y", path: "/register", at: t("2026-11-20T09:04:00+01:00") },
    ];
    expect(volgendeNaVoorpagina(paginas)).toEqual([{ path: "/register", count: 2 }]);
  });

  it("deelt paden in secties in en meldt per sectie of de meting werkt", () => {
    expect(sectieVan("/")).toBe("voorpagina");
    expect(sectieVan("/dashboard/klussen")).toBe("werker");
    expect(sectieVan("/werkgever/uren")).toBe("werkgever");
    expect(sectieVan("/studio/website")).toBe("werkgever");
    expect(sectieVan("/online")).toBe("online");
    expect(sectieVan("/shop/x")).toBe("shop");
    expect(sectieVan("/iets-onbekends")).toBe("overig");
    expect(new Set(SECTIES.map((s) => s.id)).size).toBe(SECTIES.length);
    const rijen = dekking(
      [
        { path: "/", type: "PAGEVIEW", count: 10 },
        { path: "/", type: "CLICK", count: 2 },
        { path: "/dashboard", type: "PAGEVIEW", count: 4 },
      ],
      events,
    );
    const per = Object.fromEntries(rijen.map((r) => [r.id, r]));
    expect(per.voorpagina).toMatchObject({ weergaven: 10, kliks: 2, stand: "goed", accounts: 1 });
    expect(per.werker).toMatchObject({ weergaven: 4, kliks: 0, stand: "deels", accounts: 1 });
    expect(per.shop?.stand).toBe("niets");
  });
});

describe("meetkamer: in het beheer en in de privacyverklaring", () => {
  it("staat in het menu onder Mensen & bedrijven en de pagina's vragen om een platformbeheerder", () => {
    const hub = ADMIN_HUBS.find((h) => h.pages.some((p) => p.href === "/admin/meetkamer"));
    expect(hub?.id).toBe("mensen");
    for (const f of ["app/admin/meetkamer/page.tsx", "app/admin/meetkamer/[id]/page.tsx"]) {
      expect(readFileSync(f, "utf8")).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    }
  });

  it("/privacy zegt dat gebruik aan het account wordt gekoppeld, zonder wat iemand typt, en de export bevat het", () => {
    const privacy = readFileSync("app/(marketing)/privacy/page.tsx", "utf8");
    expect(privacy).toContain("koppelen we dit gebruik en je inlogmomenten aan je account");
    expect(privacy).toContain("wat je typt, leggen we niet vast");
    const exp = readFileSync("lib/privacy/export.ts", "utf8");
    expect(exp).toContain("sections.bezoekstatistiek");
    expect(exp).toContain("sections.auditTrail"); // daar staan de inlogmomenten al
    // de beacon meet scroldiepte alleen als code-label, nooit op beheerschermen
    const beacon = readFileSync("components/analytics/AnalyticsBeacon.tsx", "utf8");
    expect(beacon).toContain('label: `scroll:${stap}`');
    expect(beacon).toContain("if (isBeheerPad(pad)) return;");
  });
});
