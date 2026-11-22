import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Inchecken is optioneel per bedrijf (22 nov 2026, eigenaar: "laat een bedrijf zelf kiezen: ja gebruik maken van de check-in, nee
// hoeft niet"). Standaard AAN; uit = geen incheckplicht, de goedkeuring van het bedrijf is het bewijs. Hier: de instelling zelf (puur
// en in de opslag), de fraudesignalen, de API waarmee het bedrijf kiest, en de teksten in alle talen. Het weigeren van een check-in,
// het goedkeuren, de autopilot, de no-show-sweep, de pushes en de agenda hebben hun eigen tests (zie checkin-optioneel-*.test.ts,
// autopilot.test.ts, no-show-sweep.test.ts, worker-push.test.ts, worker-calendar-feed.test.ts).

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  kapot: false,
  audits: [] as { action: string; summary: string; actorUserId?: string | null; targetId?: string | null }[],
  principal: { userId: "u-beheer", email: "beheer@bedrijf.test", grants: [{ role: "HQ_ADMIN", organizationId: "tenantAAA1" }] } as { userId: string; email: string; grants: { role: string; organizationId: string }[] },
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (m.kapot) throw new Error("opslag weg");
    return m.kv.has(k) ? structuredClone(m.kv.get(k)) : null;
  },
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListEntries: async (p: string, limit: number) => {
    if (m.kapot) throw new Error("opslag weg");
    return [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, value]) => ({ key, value: structuredClone(value) }));
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => m.principal,
  hasRole: (p: { grants: { role: string }[] }, ...rollen: string[]) => p.grants.some((g) => rollen.includes(g.role)),
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["tenantAAA1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; summary: string }) => void m.audits.push(a) }));

import { STANDAARD_INCHECK, leesIncheckInstelling, zonderInchecken, zonderIncheckenStand } from "@/lib/checkin/vereist-kern";
import { getIncheckInstelling, incheckenVereist, incheckenVereistVoor, tenantsZonderInchecken, zetIncheckenVereist } from "@/lib/checkin/vereist";
import { evaluateTimesheetFraud, type FraudInput } from "@/lib/fraud/timesheet";
import { FOUTEN } from "@/lib/i18n/fouten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { GET, POST } from "@/app/api/werkgever/incheck-instelling/route";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const SINDS = new Date("2026-11-22T10:00:00+01:00");

beforeEach(() => {
  m.kv.clear();
  m.kapot = false;
  m.audits.length = 0;
  m.principal = { userId: "u-beheer", email: "beheer@bedrijf.test", grants: [{ role: "HQ_ADMIN", organizationId: "tenantAAA1" }] };
});

describe("de instelling (puur)", () => {
  it("zonder keuze is inchecken nodig, zoals het altijd werkte", () => {
    expect(STANDAARD_INCHECK).toEqual({ vereist: true, sinds: null });
    expect(leesIncheckInstelling(null)).toEqual(STANDAARD_INCHECK);
    expect(leesIncheckInstelling(undefined)).toEqual(STANDAARD_INCHECK);
    expect(leesIncheckInstelling({})).toEqual(STANDAARD_INCHECK);
  });

  it("alleen een uitdrukkelijk 'vereist: false' zet inchecken uit; rommel is de standaard", () => {
    expect(leesIncheckInstelling({ vereist: false, sinds: "2026-11-22T09:00:00.000Z" })).toEqual({ vereist: false, sinds: "2026-11-22T09:00:00.000Z" });
    expect(leesIncheckInstelling({ vereist: false })).toEqual({ vereist: false, sinds: null });
    for (const rommel of ["nee", 0, false, { vereist: "false" }, { vereist: 0 }, { vereist: null }, { vereist: true }, []]) {
      expect(leesIncheckInstelling(rommel).vereist, JSON.stringify(rommel)).toBe(true);
    }
  });

  it("'zonder inchecken' is: het bedrijf vraagt het niet én er is niet ingecheckt", () => {
    expect(zonderInchecken(true, false)).toBe(false); // standaard: een ontbrekende check-in is een signaal
    expect(zonderInchecken(true, true)).toBe(false);
    expect(zonderInchecken(false, false)).toBe(true);
    expect(zonderInchecken(false, true)).toBe(false); // toch ingecheckt (bijvoorbeeld voor het uitzetten): die check-in telt mee
  });

  it("de tekst bij de uren van de werker volgt de status van het urenbriefje", () => {
    expect(zonderIncheckenStand("DRAFT")).toBe("open");
    expect(zonderIncheckenStand("SUBMITTED")).toBe("ingediend");
    expect(zonderIncheckenStand("DISPUTED")).toBe("ingediend");
    expect(zonderIncheckenStand("APPROVED")).toBe("goedgekeurd");
    expect(zonderIncheckenStand("PAID")).toBe("goedgekeurd");
  });
});

describe("de instelling (opslag per bedrijf)", () => {
  it("een bedrijf zonder keuze moet inchecken", async () => {
    expect(await incheckenVereist("tenantAAA1")).toBe(true);
    expect(await getIncheckInstelling("tenantAAA1")).toEqual(STANDAARD_INCHECK);
    expect(await tenantsZonderInchecken()).toEqual([]);
  });

  it("uitzetten geldt voor dat bedrijf alleen, met het moment waarop", async () => {
    expect(await zetIncheckenVereist("tenantAAA1", false, SINDS)).toEqual({ vereist: false, sinds: "2026-11-22T09:00:00.000Z" });
    expect(await incheckenVereist("tenantAAA1")).toBe(false);
    expect(await incheckenVereist("tenantBBB2")).toBe(true);
    const per = await incheckenVereistVoor(["tenantAAA1", "tenantBBB2", "tenantAAA1"]);
    expect([...per]).toEqual([["tenantAAA1", false], ["tenantBBB2", true]]);
  });

  it("weer aanzetten wist de rij: de lijst met bedrijven zonder inchecken blijft kort", async () => {
    await zetIncheckenVereist("tenantAAA1", false, SINDS);
    await zetIncheckenVereist("tenantBBB2", false, SINDS);
    expect((await tenantsZonderInchecken()).sort()).toEqual(["tenantAAA1", "tenantBBB2"]);
    expect(await zetIncheckenVereist("tenantAAA1", true)).toEqual(STANDAARD_INCHECK);
    expect(m.kv.has("incheck:instelling:tenantAAA1")).toBe(false);
    expect(await tenantsZonderInchecken()).toEqual(["tenantBBB2"]);
  });

  it("een storing in de opslag eist nooit stilletjes minder bewijs: inchecken blijft nodig, de lijst is leeg", async () => {
    await zetIncheckenVereist("tenantAAA1", false, SINDS);
    m.kapot = true;
    expect(await incheckenVereist("tenantAAA1")).toBe(true);
    expect(await tenantsZonderInchecken()).toEqual([]);
  });
});

describe("fraudesignalen bij een bedrijf zonder inchecken", () => {
  const START = new Date("2026-11-24T09:00:00+01:00");
  const EINDE = new Date("2026-11-24T17:00:00+01:00");
  const briefje = (extra: Partial<FraudInput> = {}): FraudInput => ({
    scheduledStart: START,
    scheduledEnd: EINDE,
    actualStart: START,
    actualEnd: EINDE,
    breakMinutes: 30,
    billableMinutes: 450,
    gpsEvents: [],
    overlappingCount: 0,
    ...extra,
  });
  type Tik = FraudInput["gpsEvents"][number];
  const checkIn = (extra: Partial<Tik> = {}): Tik => ({ type: "CHECK_IN", mocked: false, withinGeofence: true, distanceToBranchMeters: 12, recordedAt: START, ...extra });
  const codes = (i: FraudInput) => evaluateTimesheetFraud(i).map((f) => f.code);

  it("standaard: geen check-in is een waarschuwing, zoals altijd", () => {
    expect(codes(briefje())).toEqual(["NO_CHECKIN"]);
    expect(codes(briefje({ incheckenVereist: true }))).toEqual(["NO_CHECKIN"]);
  });

  it("uit: geen check-in is geen signaal, het urenbriefje is schoon", () => {
    expect(codes(briefje({ incheckenVereist: false }))).toEqual([]);
  });

  it("uit, maar er is wel ingecheckt: die check-in wordt gewoon gecontroleerd (buiten de vestiging, nep-locatie)", () => {
    expect(codes(briefje({ incheckenVereist: false, gpsEvents: [checkIn({ withinGeofence: false, distanceToBranchMeters: 900 })] }))).toEqual(["GEOFENCE_FAIL"]);
    expect(codes(briefje({ incheckenVereist: false, gpsEvents: [checkIn({ mocked: true })] }))).toContain("MOCK_GPS");
  });

  it("uit verandert de andere controles niet: dubbele uren en onmogelijke tijden blijven een signaal", () => {
    expect(codes(briefje({ incheckenVereist: false, overlappingCount: 1 }))).toEqual(["OVERLAP"]);
    expect(codes(briefje({ incheckenVereist: false, billableMinutes: 17 * 60 }))).toContain("DURATION_TOO_LONG");
  });
});

describe("de keuze van het bedrijf (API)", () => {
  const post = (body: unknown) => POST(new Request("http://localhost/api/werkgever/incheck-instelling", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("GET geeft de standaard: inchecken is nodig", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ vereist: true, sinds: null });
  });

  it("nee (uit): bewaard voor dit bedrijf, het antwoord is de stand van de server, en het staat in het auditspoor", async () => {
    const res = await post({ vereist: false });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.vereist).toBe(false);
    expect(typeof d.sinds).toBe("string");
    expect(m.kv.get("incheck:instelling:tenantAAA1")).toMatchObject({ vereist: false });
    expect(m.audits).toEqual([expect.objectContaining({ action: "checkin.vereist.uit", targetId: "tenantAAA1", actorUserId: "u-beheer" })]);
    expect(m.audits[0]?.summary).toContain("UIT");
    expect(await (await GET()).json()).toMatchObject({ vereist: false });
  });

  it("ja (aan): terug naar de standaard, de rij verdwijnt", async () => {
    await post({ vereist: false });
    const res = await post({ vereist: true });
    expect(await res.json()).toEqual({ vereist: true, sinds: null });
    expect(m.kv.has("incheck:instelling:tenantAAA1")).toBe(false);
    expect(m.audits.map((a) => a.action)).toEqual(["checkin.vereist.uit", "checkin.vereist.aan"]);
  });

  it("alleen wie uren mag goedkeuren kan het wijzigen; een werker niet, en er wordt niets bewaard", async () => {
    m.principal = { userId: "u-werker", email: "werker@x.test", grants: [{ role: "FREELANCER", organizationId: "tenantAAA1" }] };
    const res = await post({ vereist: false });
    expect(res.status).toBe(403);
    expect(m.kv.size).toBe(0);
    expect(m.audits).toEqual([]);
  });

  it("een onbruikbare invoer wordt geweigerd en verandert niets", async () => {
    for (const rommel of [{ vereist: "nee" }, {}, "geen json"]) {
      const res = await post(rommel);
      expect(res.status, JSON.stringify(rommel)).toBe(422);
    }
    expect(m.kv.size).toBe(0);
  });
});

describe("teksten in alle talen en de aansluiting op de schermen", () => {
  it("de werker-app heeft de zin 'geen inchecken' en de uren-teksten in alle vijf talen, echt vertaald", () => {
    const talen = ["nl", "en", "pl", "ro", "uk"] as const;
    for (const t of talen) {
      const d = FREELANCER_DICTS[t];
      for (const tekst of [d.checkinPage.geenInchecken, d.hoursPage.zonderIngediend, d.hoursPage.zonderGoedgekeurd]) expect(tekst.length, t).toBeGreaterThan(20);
      if (t !== "nl") {
        expect(d.checkinPage.geenInchecken, t).not.toBe(FREELANCER_DICTS.nl.checkinPage.geenInchecken);
        expect(d.hoursPage.zonderIngediend, t).not.toBe(FREELANCER_DICTS.nl.hoursPage.zonderIngediend);
        expect(d.hoursPage.zonderGoedgekeurd, t).not.toBe(FREELANCER_DICTS.nl.hoursPage.zonderGoedgekeurd);
      }
    }
    expect(FREELANCER_DICTS.nl.checkinPage.geenInchecken).toBe("Dit bedrijf vraagt geen inchecken: dien na afloop je uren in");
    expect(FREELANCER_DICTS.nl.hoursPage.zonderGoedgekeurd).toContain("zonder inchecken ingediend");
    expect(FREELANCER_DICTS.nl.hoursPage.zonderGoedgekeurd).toContain("door het bedrijf goedgekeurd");
  });

  it("de foutmelding bij een geweigerde check-in staat in alle talen en in de bron", () => {
    const t = FOUTEN["checkin.nietNodig"];
    expect(t).toBeDefined();
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) expect(t?.[taal].length, taal).toBeGreaterThan(20);
    expect(lees("lib/timesheets/checkin.ts")).toContain(`"${t?.nl}"`);
  });

  it("de werkgeversapp (Nederlands en Engels) heeft de keuze, de uitleg en de regel bij de uren", () => {
    for (const d of [nl, en]) {
      for (const sleutel of ["incheckTitel", "incheckUitleg", "incheckJa", "incheckNee", "incheckNeeUitleg", "incheckBevestigUit", "incheckOpgeslagenAan", "incheckOpgeslagenUit", "incheckMislukt"] as const) {
        expect(d.company[sleutel].length, sleutel).toBeGreaterThan(10);
      }
      expect(d.hours.zonderInchecken.length).toBeGreaterThan(10);
      expect(d.hours.geenAutoGoedkeuren.length).toBeGreaterThan(10);
      expect(d.incheckQr.staatUit.length).toBeGreaterThan(10);
    }
    expect(nl.company.incheckNee).toBe("Nee, inchecken hoeft niet");
    expect(nl.hours.zonderInchecken).toContain("Zonder inchecken ingediend");
    expect(en.company.incheckNee).not.toBe(nl.company.incheckNee);
  });

  it("de schermen van de werker tonen bij 'zonder inchecken' geen incheck-knop maar de zin, en sturen door", () => {
    const kaart = lees("components/app/MyKlussenView.tsx");
    expect(kaart).toContain("if (item.zonderInchecken) {");
    expect(kaart).toContain("geenInchecken={ft.checkinPage.geenInchecken}");
    expect(kaart.indexOf("if (item.zonderInchecken) {")).toBeLessThan(kaart.indexOf("<span>{w.checkInOut}</span>"));
    const dag = lees("app/dashboard/inchecken/[timesheetId]/page.tsx");
    expect(dag).toContain("zonderInchecken(await incheckenVereist(ts.branch.tenantId)");
    expect(dag).toContain("redirect(");
    expect(lees("app/dashboard/uren/[timesheetId]/page.tsx")).toContain("zonderInchecken(await incheckenVereist(timesheet.branch.tenant.id)");
    expect(lees("app/dashboard/inchecken/page.tsx")).toContain("ft.checkinPage.geenInchecken");
    expect(lees("app/dashboard/klussen/[shiftId]/page.tsx")).toContain("ft.checkinPage.geenInchecken");
  });

  it("de werkgever vindt de keuze bij zijn bedrijfsinstellingen en bij Inchecken, en ziet het bij de uren", () => {
    expect(lees("app/werkgever/bedrijf/page.tsx")).toContain("<IncheckenInstelling initial={incheckVereist} />");
    expect(lees("app/werkgever/inchecken/page.tsx")).toContain("<IncheckenInstelling initial={vereist} />");
    expect(lees("app/werkgever/inchecken/page.tsx")).toContain("(await getDict()).incheckQr");
    const uren = lees("app/werkgever/uren/page.tsx");
    expect(uren).toContain("{h.zonderInchecken}");
    expect(uren).toContain("{autoUitgezet ? (");
  });
});
