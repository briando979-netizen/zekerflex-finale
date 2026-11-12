import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Eigenaar 12 nov: "maak een testwerkeraccount voor mij waar ik alles kan invullen en controleren, en dat elk uur
// zijn gegevens wist". Elk uur gaat precies dat ene account (TESTWERKER_EMAIL) terug naar "net aangemeld"; een
// beheerder of een ander account nooit, droog verandert niets, en een tweede keer doet niets meer.

type Rij = Record<string, unknown>;
const db = vi.hoisted(() => ({ t: {} as Record<string, Rij[]> }));

function past(rij: Rij, waar: Rij | undefined): boolean {
  for (const [k, v] of Object.entries(waar ?? {})) {
    if (k === "OR") {
      if (!(v as Rij[]).some((w) => past(rij, w))) return false;
      continue;
    }
    if (k === "NOT") {
      if (past(rij, v as Rij)) return false;
      continue;
    }
    const r = rij[k];
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      const f = v as Rij;
      if ("equals" in f) {
        if (f.mode === "insensitive" ? String(r).toLowerCase() !== String(f.equals).toLowerCase() : r !== f.equals) return false;
        continue;
      }
      if ("in" in f) {
        if (!(f.in as unknown[]).includes(r)) return false;
        continue;
      }
      if ("not" in f) {
        if (f.not === null ? r == null : r === f.not) return false;
        continue;
      }
      if ("startsWith" in f) {
        if (!String(r ?? "").startsWith(String(f.startsWith))) return false;
        continue;
      }
      if (!r || typeof r !== "object" || !past(r as Rij, f)) return false;
      continue;
    }
    if (r !== v) return false;
  }
  return true;
}

function tabel(naam: string) {
  const rijen = () => (db.t[naam] ??= []);
  return {
    findMany: async ({ where }: { where?: Rij } = {}) => rijen().filter((r) => past(r, where)),
    findFirst: async ({ where }: { where?: Rij } = {}) => rijen().find((r) => past(r, where)) ?? null,
    findUnique: async ({ where }: { where?: Rij } = {}) => rijen().find((r) => past(r, where)) ?? null,
    count: async ({ where }: { where?: Rij } = {}) => rijen().filter((r) => past(r, where)).length,
    deleteMany: async ({ where }: { where?: Rij } = {}) => {
      const voor = rijen().length;
      db.t[naam] = rijen().filter((r) => !past(r, where));
      return { count: voor - (db.t[naam] ?? []).length };
    },
    delete: async ({ where }: { where: Rij }) => {
      const r = rijen().find((x) => past(x, where));
      if (!r) throw new Error(`${naam}: niet gevonden`);
      db.t[naam] = rijen().filter((x) => x !== r);
      return r;
    },
    updateMany: async ({ where, data }: { where?: Rij; data: Rij }) => {
      const geraakt = rijen().filter((r) => past(r, where));
      for (const r of geraakt) Object.assign(r, data);
      return { count: geraakt.length };
    },
    update: async ({ where, data }: { where: Rij; data: Rij }) => {
      const r = rijen().find((x) => past(x, where));
      if (!r) throw new Error(`${naam}: niet gevonden`);
      return Object.assign(r, data);
    },
  };
}


vi.mock("@/lib/prisma", () => {
  const MODELLEN = [
    "user", "membership", "freelancerProfile", "invoice", "payslipRecord", "advanceRecord", "domeinBestelling", "complianceDocument", "certificate",
    "workRight", "identityVerification", "shiftMatch", "shiftAssignment", "timesheet", "replacementRequest", "webPushSubscription", "passkey",
    "deviceFingerprint", "payoutPreference", "accountDeletionToken", "keyValueStore",
  ] as const;
  const p: Record<string, unknown> = {};
  for (const m of MODELLEN) p[m] = tabel(m);
  // user: met zijn rollen en profiel, zoals de select vraagt
  const u = tabel("user");
  p.user = {
    ...u,
    findFirst: async (a: { where?: Rij }) => {
      const r = await u.findFirst(a);
      if (!r) return null;
      return { ...r, memberships: (db.t.membership ?? []).filter((m) => m.userId === r.id), freelancerProfile: (db.t.freelancerProfile ?? []).find((f) => f.userId === r.id) ?? null };
    },
  };
  p.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(p);
  return { prisma: p };
});
const gewisteBestanden = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/storage/local", () => ({ deleteUpload: async (id: string) => void gewisteBestanden.push(id) }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => ((db.t.keyValueStore ?? []).find((r) => r.key === k)?.value as unknown) ?? null }));
vi.mock("@/lib/privacy/bank-wissen", () => ({ wisBankrekeningVan: async () => "geen" }));
vi.mock("@/lib/kyc/overdracht", () => ({ overdrachtUploads: async () => [] }));
const recordAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/audit", () => ({ recordAudit }));

import { resetTestwerker } from "@/lib/testwerker/reset";
import { isTestwerker, testwerkerAdres, zonderTestwerker } from "@/lib/testwerker/adres";
import { isTestAccount } from "@/lib/admin/onboarding-model";
import { FOUTEN } from "@/lib/i18n/fouten";

const ADRES = "Testwerker@Proef-Eigenaar.nl";

/** Twee werkers met dezelfde soort gegevens: de testwerker (t) en een gewone werker (a). */
function vul(rolTest: string[] = ["FREELANCER"]) {
  const gegevens = (u: string, f: string, extra: Rij = {}) => ({
    freelancerProfile: [{ id: f, userId: u }],
    complianceDocument: [{ id: `cd-${u}`, userId: u, uploadId: `up-doc-${u}` }],
    certificate: [{ id: `ce-${u}`, userId: u, uploadId: `up-cert-${u}` }],
    workRight: [{ id: `wr-${u}`, userId: u, uploadId: null }],
    identityVerification: [{ id: `iv-${u}`, userId: u, rawPayload: { uploadIds: { front: `up-voor-${u}`, selfie: `up-selfie-${u}` } } }],
    shiftMatch: [{ id: `sm-${u}`, freelancerId: f }],
    shiftAssignment: [{ id: `sa-${u}`, freelancerId: f }],
    timesheet: [{ id: `ts-${u}`, freelancerId: f }],
    webPushSubscription: [{ id: `wp-${u}`, userId: u, freelancerId: f }],
    passkey: [{ id: `pk-${u}`, userId: u }],
    keyValueStore: [
      { key: `prefs:${u}`, value: { taal: "nl" } },
      { key: `auth-2fa:${u}`, value: { aan: true } },
      { key: `uitzend-contracts:${u}`, value: [{ id: 1 }] },
      { key: `fiscal:${u}`, value: { workerKind: "zzp", bsnLast4: "1234", ...extra } },
    ],
  });
  const t = gegevens("u-test", "f-test");
  const a = gegevens("u-ander", "f-ander");
  db.t = {
    user: [
      { id: "u-test", email: ADRES.toLowerCase(), kycStatus: "VERIFIED", disabledAt: null, passwordHash: "x", emailVerifiedAt: new Date("2026-11-12T10:00:00Z") },
      { id: "u-ander", email: "ander@werker.nl", kycStatus: "VERIFIED", disabledAt: null, passwordHash: "y", emailVerifiedAt: new Date("2026-11-12T10:00:00Z") },
    ],
    membership: [...rolTest.map((role, i) => ({ id: `m-t${i}`, userId: "u-test", role })), { id: "m-a", userId: "u-ander", role: "FREELANCER" }],
    invoice: [],
    payslipRecord: [],
    advanceRecord: [],
    domeinBestelling: [],
    replacementRequest: [],
    deviceFingerprint: [],
    payoutPreference: [],
    accountDeletionToken: [],
  };
  for (const [k, v] of Object.entries(t)) db.t[k] = [...(v as Rij[]), ...((a as Record<string, Rij[]>)[k] ?? [])];
}

const kopie = () => JSON.parse(JSON.stringify(db.t)) as unknown;
const vanAnder = () => JSON.stringify(Object.fromEntries(Object.entries(db.t).map(([k, rijen]) => [k, rijen.filter((r) => JSON.stringify(r).includes("ander"))])));

beforeEach(() => {
  vul();
  gewisteBestanden.length = 0;
  recordAudit.mockClear();
  vi.stubEnv("TESTWERKER_EMAIL", ADRES);
});
afterEach(() => vi.unstubAllEnvs());

describe("resetTestwerker", () => {
  it("zonder TESTWERKER_EMAIL doet hij niets (en dat is een geslaagde run)", async () => {
    vi.stubEnv("TESTWERKER_EMAIL", "");
    const voor = kopie();
    expect(await resetTestwerker()).toEqual({ status: "uit", aantallen: {}, bewaard: {} });
    expect(kopie()).toEqual(voor);
  });

  it("droog telt alleen: er verandert niets", async () => {
    const voor = kopie();
    const u = await resetTestwerker({ droog: true });
    expect(u.status).toBe("droog");
    expect(u.aantallen).toMatchObject({ profiel: 1, reacties: 1, toewijzingen: 1, urenbriefjes: 1, idControles: 1, documenten: 1, passkeys: 1, fiscaal: 1, kycStatus: 1 });
    expect(u.aantallen.kv).toBe(3); // prefs, 2FA, uitzendcontract
    expect(kopie()).toEqual(voor);
    expect(gewisteBestanden).toEqual([]);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("zet alleen de testwerker terug naar net aangemeld; de andere werker blijft precies zoals hij was", async () => {
    const ander = vanAnder();
    const u = await resetTestwerker();
    expect(u.status).toBe("gereset");
    expect(vanAnder()).toBe(ander);

    const van = (tabelNaam: string) => (db.t[tabelNaam] ?? []).filter((r) => JSON.stringify(r).includes("test"));
    for (const t of ["freelancerProfile", "complianceDocument", "certificate", "workRight", "identityVerification", "shiftMatch", "shiftAssignment", "timesheet", "passkey"]) {
      expect(van(t), t).toEqual([]);
    }
    // het account zelf blijft: inloggen kan meteen weer
    expect(db.t.user?.find((r) => r.id === "u-test")).toMatchObject({ email: ADRES.toLowerCase(), passwordHash: "x", kycStatus: "NOT_STARTED" });
    expect(db.t.membership?.filter((m) => m.userId === "u-test")).toEqual([{ id: "m-t0", userId: "u-test", role: "FREELANCER" }]);
    // de soort werker uit het aanmelden blijft, de rest van de fiscale gegevens niet; 2FA en instellingen weg
    const kv = new Map((db.t.keyValueStore ?? []).map((r) => [r.key, r.value]));
    expect(kv.get("fiscal:u-test")).toEqual({ workerKind: "zzp" });
    expect(kv.has("auth-2fa:u-test")).toBe(false);
    expect(kv.has("prefs:u-test")).toBe(false);
    expect(kv.has("uitzend-contracts:u-test")).toBe(false);
    // de pushmelding van zijn apparaat blijft, los van het oude profiel
    expect(db.t.webPushSubscription?.find((r) => r.id === "wp-u-test")).toMatchObject({ userId: "u-test", freelancerId: null });
    // alleen zijn eigen bestanden
    expect(gewisteBestanden.sort()).toEqual(["up-cert-u-test", "up-doc-u-test", "up-selfie-u-test", "up-voor-u-test"]);
    // het auditspoor noemt alleen aantallen, geen adres
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(recordAudit.mock.calls)).not.toMatch(/proef-eigenaar/i);
  });

  it("een tweede keer doet niets meer (idempotent) en schrijft geen nieuw auditspoor", async () => {
    await resetTestwerker();
    const na = kopie();
    const tweede = await resetTestwerker();
    expect(tweede).toEqual({ status: "gereset", aantallen: {}, bewaard: {} });
    expect(kopie()).toEqual(na);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("een account met een beheer- of bedrijfsrol wordt nooit teruggezet", async () => {
    for (const rollen of [["FREELANCER", "PLATFORM_ADMIN"], ["HQ_ADMIN"], ["FREELANCER", "LOCAL_MANAGER"], ["SALES"]]) {
      vul(rollen);
      const voor = kopie();
      const u = await resetTestwerker();
      expect(u.status, rollen.join("+")).toBe("geweigerd");
      expect(kopie()).toEqual(voor);
    }
  });

  it("alleen het precieze adres: een ander account met een gelijkend adres blijft", async () => {
    vi.stubEnv("TESTWERKER_EMAIL", "testwerker@proef-eigenaar.n");
    const voor = kopie();
    expect((await resetTestwerker()).status).toBe("geen-account");
    expect(kopie()).toEqual(voor);
  });

  it("facturen worden nooit gewist: dan blijven het profiel en de urenbriefjes staan, en zegt de uitslag dat", async () => {
    db.t.invoice = [{ id: "inv-1", recipientFreelancerId: null, timesheet: { freelancerId: "f-test" } }];
    const u = await resetTestwerker();
    expect(u.bewaard).toEqual({ facturen: 1 });
    expect(db.t.invoice).toHaveLength(1);
    expect(db.t.freelancerProfile?.some((f) => f.id === "f-test")).toBe(true);
    expect(db.t.timesheet?.some((r) => r.id === "ts-u-test")).toBe(true);
    // de rest gaat wel weg
    expect(db.t.identityVerification?.some((r) => r.userId === "u-test")).toBe(false);
  });
});

describe("de testwerker telt niet mee en krijgt geen voorstellen", () => {
  it("adres: klein geschreven, alleen een echt adres", () => {
    expect(testwerkerAdres(" Testwerker@Proef-Eigenaar.nl ")).toBe("testwerker@proef-eigenaar.nl");
    expect(testwerkerAdres("")).toBeNull();
    expect(testwerkerAdres("geen-adres")).toBeNull();
    expect(isTestwerker("TESTWERKER@proef-eigenaar.nl", ADRES)).toBe(true);
    expect(isTestwerker("ander@werker.nl", ADRES)).toBe(false);
    expect(isTestwerker("testwerker@proef-eigenaar.nl", "")).toBe(false);
  });

  it("de filters van de matching sluiten alleen dat ene adres uit; zonder testwerker niets", () => {
    expect(zonderTestwerker(ADRES)).toEqual({ NOT: { email: { equals: "testwerker@proef-eigenaar.nl", mode: "insensitive" } } });
    expect(zonderTestwerker("")).toEqual({});
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    expect(lees("lib/matching/engine.ts")).toMatch(/kycStatus: "VERIFIED", disabledAt: null, \.\.\.zonderTestwerker\(\)/);
    expect(lees("lib/notifications/geo-push.ts")).toMatch(/disabledAt: null, \.\.\.zonderTestwerker\(\)/);
    expect(lees("lib/spoed/oproep.ts")).toMatch(/disabledAt: null, \.\.\.zonderTestwerker\(\)/);
  });

  it("reageren alleen op testklussen, met een melding in vijf talen", () => {
    const apply = readFileSync(path.join(process.cwd(), "lib/matching/apply.ts"), "utf8");
    expect(apply).toMatch(/isTestwerker\(profile\.user\.email\) && !isTestklus\(/);
    const t = FOUTEN["apply.alleenTestklus"];
    expect(t && Object.keys(t).sort()).toEqual(["en", "nl", "pl", "ro", "uk"]);
  });

  it("telt niet mee in de gebruikersanalyse", () => {
    expect(isTestAccount({ email: ADRES.toLowerCase(), rollen: ["FREELANCER"], disabledAt: null, tenantNamen: [] })).toBe(true);
    expect(isTestAccount({ email: "ander@werker.nl", rollen: ["FREELANCER"], disabledAt: null, tenantNamen: [] })).toBe(false);
  });

  it("de route voor de uurtaak bestaat en meldt zijn run (de cron komt pas als het adres er is)", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/internal/testwerker/reset/route.ts"), "utf8");
    expect(route).toMatch(/checkInternalToken\(request\)/);
    expect(route).toMatch(/recordCronRun\("testwerker-reset", true\)/);
  });
});
