import { beforeEach, describe, expect, it, vi } from "vitest";

// KVK-controle met de hand (22 nov 2026, lib/kvk/handmatig.ts en handmatig-server.ts): de eigenaar zoekt een KVK-nummer zelf op
// kvk.nl en keurt het in Beheer goed, voor een bedrijf en voor een werker die op de controle wacht. Zonder KVKBase of de open
// dataset aan te roepen; met beheerder, datum, nummer en reden vastgelegd, een auditregel en een terugdraaiknop.

interface Reg {
  id: string;
  source: string;
}
interface ProfielRij {
  id: string;
  kvkNumber: string;
  kvkValid: boolean;
  kvkVerifiedAt: Date | null;
  companyRegistrationId: string | null;
  companyRegistration: Reg | null;
}
interface TenantRij {
  id: string;
  name: string;
  kvkNumber: string | null;
  companyRegistrationId: string | null;
  companyRegistration: Reg | null;
}

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  profiel: null as ProfielRij | null,
  tenant: null as TenantRij | null,
  profielen: [] as { userId: string; kvkNumber: string; user: { fullName: string } }[],
  gedaanProfielen: [] as { userId: string; kvkNumber: string; kvkValid: boolean; user: { fullName: string } }[],
  tenants: [] as { id: string; name: string; kvkNumber: string | null; companyRegistrationId: string | null }[],
  registraties: new Map<string, { id: string; source: string }>(),
  gemaakt: [] as { kvkNumber: string; source: string; legalName: string }[],
  verwijderd: [] as unknown[],
  updates: [] as { model: "profiel" | "tenant"; data: Record<string, unknown> }[],
  tenantFout: null as null | { code: string },
  audits: [] as Record<string, unknown>[],
  approvals: [] as [string, boolean, string][],
  gemeld: [] as string[],
  fetch: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void h.kv.delete(k),
  kvListEntries: async (prefix: string) => [...h.kv].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    companyRegistration: {
      upsert: async (a: { where: { kvkNumber: string }; create: { kvkNumber: string; source: string; legalName: string } }) => {
        const bestaand = h.registraties.get(a.where.kvkNumber);
        if (bestaand) return { id: bestaand.id };
        const rij = { id: `reg-${a.where.kvkNumber}`, source: a.create.source };
        h.registraties.set(a.where.kvkNumber, rij);
        h.gemaakt.push(a.create);
        return { id: rij.id };
      },
      deleteMany: async (a: unknown) => {
        h.verwijderd.push(a);
        return { count: 1 };
      },
    },
    freelancerProfile: {
      update: async (a: { data: Record<string, unknown> }) => {
        h.updates.push({ model: "profiel", data: a.data });
        if (h.profiel) {
          Object.assign(h.profiel, a.data);
          h.profiel.companyRegistration = [...h.registraties.values()].find((r) => r.id === h.profiel?.companyRegistrationId) ?? null;
        }
        return h.profiel;
      },
    },
    tenant: {
      update: async (a: { data: Record<string, unknown> }) => {
        if (h.tenantFout) throw Object.assign(new Error("unique constraint"), h.tenantFout);
        h.updates.push({ model: "tenant", data: a.data });
        if (h.tenant) {
          Object.assign(h.tenant, a.data);
          h.tenant.companyRegistration = [...h.registraties.values()].find((r) => r.id === h.tenant?.companyRegistrationId) ?? null;
        }
        return h.tenant;
      },
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      freelancerProfile: {
        findUnique: async () => h.profiel,
        findMany: async (a: { where: { userId?: unknown } }) => (a.where.userId ? h.gedaanProfielen : h.profielen),
      },
      tenant: { findUnique: async () => h.tenant, findMany: async () => h.tenants },
    },
  };
});
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void h.audits.push(a) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (f: () => Promise<unknown>) => void f() }));
vi.mock("@/lib/company/verified", () => ({
  setTenantApproval: async (id: string, goed: boolean, door: string) => void h.approvals.push([id, goed, door]),
  notifyPendingReactions: async (id: string) => {
    h.gemeld.push(id);
    return 0;
  },
}));

import { AppError } from "@/lib/errors";
import {
  KVK_HANDMATIG_PREFIX,
  MIN_REDEN,
  auditGoedkeuring,
  auditTerugdraaien,
  beslisKeuring,
  controleerGoedkeuring,
  controleerTerugdraaien,
  draaiTerug,
  handmatigRegel,
  isActief,
  kvkNlLink,
  maakHandmatig,
  normaliseerKvkNummer,
  paneelStand,
  standVanWacht,
  terugdraaiRegel,
  type KeuringContext,
  type KvkHandmatig,
} from "@/lib/kvk/handmatig";
import { HANDMATIG_BRON, draaiKvkHandmatigTerug, keurKvkHandmatigGoed, kvkControleOverzicht, leesKvkHandmatig, type KvkPrincipal } from "@/lib/kvk/handmatig-server";
import { ERASABLE_KV_PREFIXES, erasableKvWhere } from "@/lib/privacy/user-kv";

const NU = new Date("2026-11-22T10:00:00+01:00");
const LATER = new Date("2026-11-23T09:30:00+01:00");
const ADMIN: KvkPrincipal = { userId: "adm1", email: "eigenaar@zekerflex.test", fullName: "Anna de Beheerder", grants: [{ role: "PLATFORM_ADMIN" }] };
const GEWOON: KvkPrincipal = { userId: "w9", email: "werker@zekerflex.test", fullName: "Werker Negen", grants: [{ role: "FREELANCER" }] };

const invoer = { kvkNumber: "12345678", naam: "Jansen Schilderwerken", notitie: "Op kvk.nl gecontroleerd: eenmanszaak, actief.", bevestigd: true };

beforeEach(() => {
  h.kv.clear();
  h.profiel = null;
  h.tenant = null;
  h.profielen = [];
  h.gedaanProfielen = [];
  h.tenants = [];
  h.registraties.clear();
  h.gemaakt = [];
  h.verwijderd = [];
  h.updates = [];
  h.tenantFout = null;
  h.audits = [];
  h.approvals = [];
  h.gemeld = [];
  h.fetch.mockReset();
  vi.stubGlobal("fetch", h.fetch);
});

describe("het KVK-nummer en de invoer controleren (puur)", () => {
  it("een nummer is 8 cijfers, met of zonder spaties, punten of streepjes; alleen nullen of een getal telt niet", () => {
    expect(normaliseerKvkNummer("12345678")).toBe("12345678");
    expect(normaliseerKvkNummer(" 1234 5678 ")).toBe("12345678");
    expect(normaliseerKvkNummer("12.345.678")).toBe("12345678");
    expect(normaliseerKvkNummer("1234-5678")).toBe("12345678");
    expect(normaliseerKvkNummer("1234567")).toBeNull();
    expect(normaliseerKvkNummer("123456789")).toBeNull();
    expect(normaliseerKvkNummer("0000 0000")).toBeNull();
    expect(normaliseerKvkNummer("abcdefgh")).toBeNull();
    expect(normaliseerKvkNummer(12345678)).toBeNull();
    expect(normaliseerKvkNummer(null)).toBeNull();
  });

  it("een goede invoer geeft nummer, naam en reden schoon terug", () => {
    expect(controleerGoedkeuring({ ...invoer, kvkNumber: "1234 5678", naam: "  Jansen   Schilderwerken ", notitie: "  Op kvk.nl\n gezien, actief  " })).toEqual({
      ok: true,
      waarde: { kvkNumber: "12345678", naam: "Jansen Schilderwerken", notitie: "Op kvk.nl gezien, actief" },
    });
  });

  it("elke ontbrekende of foute waarde geeft een melding in gewoon Nederlands bij het goede veld", () => {
    expect(controleerGoedkeuring({ ...invoer, kvkNumber: "123" })).toMatchObject({ ok: false, veld: "kvkNumber", fout: expect.stringContaining("8 cijfers") });
    expect(controleerGoedkeuring({ ...invoer, naam: " " })).toMatchObject({ ok: false, veld: "naam", fout: expect.stringContaining("bedrijfsnaam") });
    expect(controleerGoedkeuring({ ...invoer, naam: "x".repeat(121) })).toMatchObject({ ok: false, veld: "naam", fout: expect.stringContaining("te lang") });
    expect(controleerGoedkeuring({ ...invoer, notitie: "ok" })).toMatchObject({ ok: false, veld: "notitie", fout: expect.stringContaining(`minimaal ${MIN_REDEN} tekens`) });
    expect(controleerGoedkeuring({ ...invoer, notitie: "y".repeat(501) })).toMatchObject({ ok: false, veld: "notitie", fout: expect.stringContaining("te lang") });
    expect(controleerGoedkeuring({ ...invoer, bevestigd: false })).toMatchObject({ ok: false, veld: "bevestigd", fout: expect.stringContaining("kvk.nl") });
    expect(controleerGoedkeuring({ ...invoer, bevestigd: "ja" })).toMatchObject({ ok: false, veld: "bevestigd" });
  });

  it("de reden bij het terugdraaien is verplicht, minimaal 5 tekens", () => {
    expect(controleerTerugdraaien("klopte niet")).toEqual({ ok: true, waarde: { reden: "klopte niet" } });
    expect(controleerTerugdraaien("   nee ")).toMatchObject({ ok: false, veld: "notitie" });
    expect(controleerTerugdraaien(undefined)).toMatchObject({ ok: false });
  });

  it("de link naar kvk.nl heeft het nummer erin, en zonder geldig nummer de zoekpagina", () => {
    expect(kvkNlLink("12345678")).toContain("12345678");
    expect(kvkNlLink("12 345 678")).toContain("12345678");
    expect(kvkNlLink("kapot")).toBe("https://www.kvk.nl/zoeken/");
    expect(kvkNlLink(null)).toBe("https://www.kvk.nl/zoeken/");
  });
});

describe("mag deze beheerder dit? (puur)", () => {
  const basis: KeuringContext = { rollen: ["PLATFORM_ADMIN"], soort: "werker", actie: "goedkeuren", bekendNummer: "12345678", invoerNummer: "12345678", alGeldig: false, handmatig: null };
  const actief: KvkHandmatig = maakHandmatig({ kvkNumber: "12345678", naam: "Jansen", notitie: "gecontroleerd", door: { id: "adm1", naam: "Anna" }, nu: NU });

  it("alleen een platformbeheerder, en dan met 423 (geen 403: CrowdSec) en een eigen code", () => {
    expect(beslisKeuring(basis)).toEqual({ ok: true });
    for (const rollen of [[], ["FREELANCER"], ["HQ_ADMIN", "LOCAL_MANAGER"], ["SALES"]]) {
      expect(beslisKeuring({ ...basis, rollen })).toMatchObject({ ok: false, status: 423, code: "ALLEEN_PLATFORMBEHEER" });
    }
  });

  it("goedkeuren kan niet als de controle al geslaagd is, ook niet voor een tweede keer", () => {
    expect(beslisKeuring({ ...basis, alGeldig: true })).toMatchObject({ ok: false, status: 409, code: "AL_GEDAAN", bericht: expect.stringContaining("al geslaagd") });
    expect(beslisKeuring({ ...basis, alGeldig: true, handmatig: actief })).toMatchObject({ ok: false, status: 409, bericht: expect.stringContaining("Draai het eerst terug") });
  });

  it("het nummer van de beheerder moet het nummer zijn dat de werker of het bedrijf opgaf", () => {
    expect(beslisKeuring({ ...basis, invoerNummer: "87654321" })).toMatchObject({ ok: false, status: 422, code: "NUMMER_KOMT_NIET_OVEREEN", bericht: expect.stringContaining("12345678") });
    expect(beslisKeuring({ ...basis, soort: "bedrijf", invoerNummer: "87654321" })).toMatchObject({ ok: false, code: "NUMMER_KOMT_NIET_OVEREEN", bericht: expect.stringContaining("Het bedrijf") });
    // een bedrijf zonder bekend nummer (de aanmelding kon niet): de beheerder vult het in
    expect(beslisKeuring({ ...basis, soort: "bedrijf", bekendNummer: null, invoerNummer: "87654321" })).toEqual({ ok: true });
    // een werker zonder nummer van 8 cijfers: eerst laten invullen
    expect(beslisKeuring({ ...basis, bekendNummer: null })).toMatchObject({ ok: false, status: 422, code: "GEEN_NUMMER" });
  });

  it("een goedkeuring die niet meer geldt (teruggedraaid, of de geldigheid ontbreekt) mag opnieuw", () => {
    expect(beslisKeuring({ ...basis, handmatig: draaiTerug(actief, { door: { id: "adm1", naam: "Anna" }, reden: "fout nummer", nu: LATER }) })).toEqual({ ok: true });
    expect(beslisKeuring({ ...basis, alGeldig: false, handmatig: actief })).toEqual({ ok: true });
  });

  it("terugdraaien kan alleen bij een goedkeuring die nog staat", () => {
    expect(beslisKeuring({ ...basis, actie: "terugdraaien", handmatig: actief })).toEqual({ ok: true });
    expect(beslisKeuring({ ...basis, actie: "terugdraaien", handmatig: null })).toMatchObject({ ok: false, status: 409, code: "NIET_HANDMATIG" });
    expect(beslisKeuring({ ...basis, actie: "terugdraaien", handmatig: draaiTerug(actief, { door: { id: "a", naam: "A" }, reden: "reden", nu: LATER }) })).toMatchObject({ ok: false, code: "NIET_HANDMATIG" });
    expect(beslisKeuring({ ...basis, rollen: ["FREELANCER"], actie: "terugdraaien", handmatig: actief })).toMatchObject({ ok: false, status: 423 });
  });
});

describe("wat er vastligt en in het auditspoor komt (puur)", () => {
  const door = { id: "adm1", naam: "Anna de Beheerder" };
  const h1 = maakHandmatig({ kvkNumber: "12345678", naam: "Jansen Schilderwerken", notitie: "Op kvk.nl gezien", door, nu: NU });

  it("beheerder (id en naam), datum, nummer, naam en reden; terugdraaien voegt wie, wanneer en waarom toe zonder iets te wissen", () => {
    expect(h1).toEqual({ kvkNumber: "12345678", naam: "Jansen Schilderwerken", notitie: "Op kvk.nl gezien", door, op: NU.toISOString() });
    expect(isActief(h1)).toBe(true);
    const terug = draaiTerug(h1, { door: { id: "adm2", naam: "Piet" }, reden: "nummer klopte niet", nu: LATER });
    expect(terug).toEqual({ ...h1, teruggedraaid: { door: { id: "adm2", naam: "Piet" }, op: LATER.toISOString(), reden: "nummer klopte niet" } });
    expect(isActief(terug)).toBe(false);
    expect(isActief(null)).toBe(false);
    // het origineel is niet aangepast
    expect(h1.teruggedraaid).toBeUndefined();
  });

  it("de auditregel noemt het nummer en de soort, geen namen; de reden staat in de metadata", () => {
    const a = auditGoedkeuring({ soort: "werker", kvkNumber: "12345678", notitie: "Op kvk.nl gezien" });
    expect(a).toMatchObject({ action: "kvk.handmatig_goedgekeurd", severity: "warning", metadata: { soort: "werker", kvkNumber: "12345678", reden: "Op kvk.nl gezien" } });
    expect(a.summary).toContain("12345678");
    expect(a.summary).not.toMatch(/Anna|Jansen|Op kvk\.nl gezien/);
    const t = auditTerugdraaien({ soort: "bedrijf", kvkNumber: "12345678", reden: "nummer klopte niet", geldigheidBlijft: true });
    expect(t).toMatchObject({ action: "kvk.handmatig_teruggedraaid", metadata: { soort: "bedrijf", reden: "nummer klopte niet", geldigheidBlijft: true } });
    expect(t.summary).not.toContain("nummer klopte niet");
  });

  it("in Beheer staat wie het deed en wanneer, zodat het verschil met KVKBase blijft", () => {
    expect(handmatigRegel(h1)).toMatch(/^Handmatig gecontroleerd door Anna de Beheerder op 22 nov\.? 2026$/);
    expect(terugdraaiRegel({ door: { id: "adm2", naam: "Piet" }, op: LATER.toISOString(), reden: "fout nummer" })).toMatch(/^Teruggedraaid door Piet op 23 nov\.? 2026: fout nummer$/);
  });

  it("het paneel toont met de hand alleen als de geldigheid er staat en het nummer hetzelfde is", () => {
    expect(paneelStand({ geldig: true, handmatig: h1, huidigNummer: "12345678" })).toBe("handmatig");
    expect(paneelStand({ geldig: true, handmatig: h1, huidigNummer: "87654321" })).toBe("automatisch");
    expect(paneelStand({ geldig: true, handmatig: null, huidigNummer: "12345678" })).toBe("automatisch");
    expect(paneelStand({ geldig: false, handmatig: h1, huidigNummer: "12345678" })).toBe("open");
    expect(paneelStand({ geldig: true, handmatig: draaiTerug(h1, { door, reden: "reden", nu: LATER }), huidigNummer: "12345678" })).toBe("automatisch");
  });

  it("de stand van de wacht: niet gevonden, wachtend of nog niet in de wacht", () => {
    expect(standVanWacht({ inWacht: true, opgegevenNummer: "12345678", nummer: "12345678" })).toMatchObject({ stand: "opgegeven", tone: "crit" });
    expect(standVanWacht({ inWacht: true, opgegevenNummer: "99999999", nummer: "12345678" })).toMatchObject({ stand: "wacht", tone: "warn" });
    expect(standVanWacht({ inWacht: false, opgegevenNummer: null, nummer: "12345678" })).toMatchObject({ stand: "nieuw", tone: "neutral" });
  });
});

describe("een wachtende werker goedkeuren", () => {
  const werker = (): ProfielRij => ({ id: "fp1", kvkNumber: "12345678", kvkValid: false, kvkVerifiedAt: null, companyRegistrationId: null, companyRegistration: null });
  const zetWacht = () => {
    h.kv.set("kvk-wacht:werker:u1", { kvkNumber: "12345678", sinds: "2026-11-13T02:00:00.000Z", volgende: "2026-11-23T06:00:00.000Z", pogingen: 3, limiet: "tegoed" });
    h.kv.set("kvk-opgegeven:werker:u1", { kvkNumber: "12345678", op: "2026-11-14T08:30:00.000Z" });
  };

  it("zet de geldigheid op waar, legt alles vast en haalt de controle uit de wacht, zonder KVKBase of de open dataset aan te roepen", async () => {
    h.profiel = werker();
    zetWacht();
    const uit = await keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: NU });

    expect(h.profiel).toMatchObject({ kvkValid: true, kvkVerifiedAt: NU, companyRegistrationId: "reg-12345678" });
    expect(h.gemaakt).toEqual([expect.objectContaining({ kvkNumber: "12345678", source: HANDMATIG_BRON, legalName: "Jansen Schilderwerken" })]);
    expect(uit).toEqual({ kvkNumber: "12345678", naam: "Jansen Schilderwerken", notitie: invoer.notitie, door: { id: "adm1", naam: "Anna de Beheerder" }, op: NU.toISOString() });
    expect(h.kv.get("kvk-handmatig:werker:u1")).toEqual(uit);
    expect(await leesKvkHandmatig("werker", "u1")).toEqual(uit);
    expect(h.kv.has("kvk-wacht:werker:u1")).toBe(false);
    expect(h.kv.has("kvk-opgegeven:werker:u1")).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.approvals).toEqual([]); // een werker heeft geen bedrijfsgoedkeuring
    expect(h.audits).toEqual([
      expect.objectContaining({ category: "COMPANY", action: "kvk.handmatig_goedgekeurd", actorUserId: "adm1", targetType: "user", targetId: "u1", severity: "warning" }),
    ]);
    expect(JSON.stringify(h.audits)).not.toMatch(/Anna|Jansen/);
  });

  it("een ander nummer dan de werker opgaf wordt geweigerd, en er verandert niets", async () => {
    h.profiel = werker();
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, kvkNumber: "87654321", nu: NU })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("12345678") });
    expect(h.updates).toEqual([]);
    expect(h.kv.size).toBe(0);
    expect(h.audits).toEqual([]);
  });

  it("een gewone gebruiker krijgt 423, geen 403, en er verandert niets", async () => {
    h.profiel = werker();
    const fout = await keurKvkHandmatigGoed({ principal: GEWOON, soort: "werker", id: "u1", ...invoer, nu: NU }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(AppError);
    expect(fout).toMatchObject({ status: 423, code: "ALLEEN_BEHEERDER" });
    expect(h.updates).toEqual([]);
    expect(h.kv.size).toBe(0);
  });

  it("een werker met een geldige controle (KVKBase) hoeft niets, en een onbekende werker geeft 404", async () => {
    h.profiel = { ...werker(), kvkValid: true };
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: NU })).rejects.toMatchObject({ status: 409 });
    h.profiel = null;
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: NU })).rejects.toMatchObject({ status: 404 });
  });

  it("slechte invoer geeft 422 met het veld, voor er iets wordt gelezen of geschreven", async () => {
    h.profiel = werker();
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, notitie: "ja", nu: NU })).rejects.toMatchObject({ status: 422, details: { veld: "notitie" } });
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, bevestigd: undefined, nu: NU })).rejects.toMatchObject({ status: 422, details: { veld: "bevestigd" } });
    expect(h.updates).toEqual([]);
  });

  it("terugdraaien zet de controle weer open, met reden, en haalt de eigen inschrijving weg", async () => {
    h.profiel = werker();
    await keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: NU });
    h.updates = [];
    const uit = await draaiKvkHandmatigTerug({ principal: ADMIN, soort: "werker", id: "u1", reden: "Nummer bleek van een ander bedrijf", nu: LATER });

    expect(uit.geldigheidBlijft).toBe(false);
    expect(h.profiel).toMatchObject({ kvkValid: false, kvkVerifiedAt: null, companyRegistrationId: null });
    expect(h.verwijderd).toHaveLength(1);
    expect(uit.handmatig.teruggedraaid).toEqual({ door: { id: "adm1", naam: "Anna de Beheerder" }, op: LATER.toISOString(), reden: "Nummer bleek van een ander bedrijf" });
    expect(isActief(await leesKvkHandmatig("werker", "u1"))).toBe(false);
    expect(h.audits.at(-1)).toMatchObject({ action: "kvk.handmatig_teruggedraaid", targetType: "user", targetId: "u1", metadata: { reden: "Nummer bleek van een ander bedrijf", geldigheidBlijft: false } });
    // nog eens terugdraaien kan niet
    await expect(draaiKvkHandmatigTerug({ principal: ADMIN, soort: "werker", id: "u1", reden: "nog eens proberen", nu: LATER })).rejects.toMatchObject({ status: 409 });
    // en daarna kan er weer worden goedgekeurd
    await keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: LATER });
    expect(h.profiel).toMatchObject({ kvkValid: true });
  });

  it("is de controle intussen opnieuw gedaan, dan blijft die staan: alleen de markering wordt teruggedraaid", async () => {
    h.profiel = werker();
    await keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: NU });
    if (h.profiel) h.profiel.kvkVerifiedAt = new Date("2026-11-22T20:00:00+01:00"); // een controle via KVKBase
    h.updates = [];
    const uit = await draaiKvkHandmatigTerug({ principal: ADMIN, soort: "werker", id: "u1", reden: "toch maar terugdraaien", nu: LATER });
    expect(uit.geldigheidBlijft).toBe(true);
    expect(h.updates).toEqual([]);
    expect(h.profiel).toMatchObject({ kvkValid: true });
    expect(isActief(uit.handmatig)).toBe(false);
  });

  it("terugdraaien vraagt een reden en een platformbeheerder", async () => {
    h.profiel = werker();
    await keurKvkHandmatigGoed({ principal: ADMIN, soort: "werker", id: "u1", ...invoer, nu: NU });
    await expect(draaiKvkHandmatigTerug({ principal: ADMIN, soort: "werker", id: "u1", reden: "nee", nu: LATER })).rejects.toMatchObject({ status: 422 });
    await expect(draaiKvkHandmatigTerug({ principal: GEWOON, soort: "werker", id: "u1", reden: "geen recht om dit te doen", nu: LATER })).rejects.toMatchObject({ status: 423 });
    expect(h.profiel).toMatchObject({ kvkValid: true });
  });
});

describe("een bedrijf goedkeuren", () => {
  const bedrijf = (): TenantRij => ({ id: "t1", name: "Jansen BV (aanmelding)", kvkNumber: null, companyRegistrationId: null, companyRegistration: null });
  const zetWacht = () => h.kv.set("kvk-wacht:bedrijf:t1", { kvkNumber: "12345678", sinds: "2026-11-21T09:00:00.000Z", volgende: "2026-11-23T06:00:00.000Z", pogingen: 1, limiet: "tegoed" });

  it("koppelt de inschrijving, zet de goedkeuring van de poort en informeert wie op de testklus reageerde", async () => {
    h.tenant = bedrijf();
    zetWacht();
    const uit = await keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, nu: NU });

    expect(h.tenant).toMatchObject({ kvkNumber: "12345678", companyRegistrationId: "reg-12345678", name: "Jansen Schilderwerken" });
    expect(h.approvals).toEqual([["t1", true, "eigenaar@zekerflex.test"]]);
    expect(h.gemeld).toEqual(["t1"]);
    expect(h.kv.get("kvk-handmatig:bedrijf:t1")).toEqual(uit);
    expect(h.kv.has("kvk-wacht:bedrijf:t1")).toBe(false);
    expect(h.audits).toEqual([expect.objectContaining({ action: "kvk.handmatig_goedgekeurd", targetType: "tenant", targetId: "t1", actorUserId: "adm1" })]);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("het nummer moet het nummer zijn dat het bedrijf opgaf; zonder bekend nummer vult de beheerder het in", async () => {
    h.tenant = bedrijf();
    zetWacht();
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, kvkNumber: "87654321", nu: NU })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("12345678") });
    expect(h.approvals).toEqual([]);
    h.kv.clear();
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, kvkNumber: "87654321", nu: NU })).resolves.toMatchObject({ kvkNumber: "87654321" });
  });

  it("een nummer van een ander bedrijf in ZekerFlex geeft 409 en laat niets achter", async () => {
    h.tenant = bedrijf();
    h.tenantFout = { code: "P2002" };
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, nu: NU })).rejects.toMatchObject({ status: 409 });
    expect(h.kv.has("kvk-handmatig:bedrijf:t1")).toBe(false);
    expect(h.approvals).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("een bedrijf dat al aan een inschrijving gekoppeld is, hoeft niets met de hand", async () => {
    h.tenant = { ...bedrijf(), companyRegistrationId: "reg-1", companyRegistration: { id: "reg-1", source: "KVKBASE" } };
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, nu: NU })).rejects.toMatchObject({ status: 409 });
    h.tenant = null;
    await expect(keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, nu: NU })).rejects.toMatchObject({ status: 404 });
  });

  it("terugdraaien trekt de goedkeuring in, haalt de eigen inschrijving weg en zet de controle terug in de wacht", async () => {
    h.tenant = bedrijf();
    zetWacht();
    await keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, nu: NU });
    h.approvals = [];
    const uit = await draaiKvkHandmatigTerug({ principal: ADMIN, soort: "bedrijf", id: "t1", reden: "Bleek een ander bedrijf", nu: LATER });

    expect(h.approvals).toEqual([["t1", false, "eigenaar@zekerflex.test"]]);
    expect(h.tenant).toMatchObject({ companyRegistrationId: null, kvkNumber: "12345678" });
    expect(h.verwijderd).toHaveLength(1);
    expect(h.kv.get("kvk-wacht:bedrijf:t1")).toMatchObject({ kvkNumber: "12345678", volgende: LATER.toISOString() });
    expect(isActief(uit.handmatig)).toBe(false);
    expect(uit.handmatig.teruggedraaid?.reden).toBe("Bleek een ander bedrijf");
    expect(h.audits.at(-1)).toMatchObject({ action: "kvk.handmatig_teruggedraaid", targetType: "tenant", targetId: "t1" });
  });

  it("een bestaande inschrijving van KVKBase blijft bij het terugdraaien staan: alleen de goedkeuring gaat weg", async () => {
    h.registraties.set("12345678", { id: "reg-echt", source: "KVKBASE" });
    h.tenant = bedrijf();
    zetWacht();
    await keurKvkHandmatigGoed({ principal: ADMIN, soort: "bedrijf", id: "t1", ...invoer, nu: NU });
    expect(h.gemaakt).toEqual([]); // geen nieuwe inschrijving naast die van KVKBase
    await draaiKvkHandmatigTerug({ principal: ADMIN, soort: "bedrijf", id: "t1", reden: "toch niet goed", nu: LATER });
    expect(h.verwijderd).toEqual([]);
    expect(h.tenant).toMatchObject({ companyRegistrationId: "reg-echt" });
  });
});

describe("het overzicht in Beheer", () => {
  it("toont de wachtende werkers met alleen naam en nummer, de wachtende bedrijven en wat met de hand is gedaan", async () => {
    h.profielen = [
      { userId: "u1", kvkNumber: "12345678", user: { fullName: "Eva Bakker" } },
      { userId: "u2", kvkNumber: "87654321", user: { fullName: "Tom Smit" } },
      { userId: "u3", kvkNumber: "kapot", user: { fullName: "Zonder Nummer" } },
    ];
    h.kv.set("kvk-wacht:werker:u1", { kvkNumber: "12345678", sinds: "2026-11-13T02:00:00.000Z", volgende: "2026-11-23T06:00:00.000Z", pogingen: 2, limiet: "tegoed" });
    h.kv.set("kvk-opgegeven:werker:u2", { kvkNumber: "87654321", op: "2026-11-14T08:30:00.000Z" });
    h.kv.set("kvk-wacht:bedrijf:t1", { kvkNumber: "11112222", sinds: "2026-11-21T09:00:00.000Z", volgende: "2026-11-23T06:00:00.000Z", pogingen: 1, limiet: "tegoed" });
    h.kv.set("kvk-wacht:bedrijf:t2", { kvkNumber: "33334444", sinds: "2026-11-21T09:00:00.000Z", volgende: "2026-11-23T06:00:00.000Z", pogingen: 1, limiet: "tegoed" });
    h.kv.set("meting:kvkbase-tegoed", { tokens: 0, perMinuut: 10, op: true, at: "2026-11-22T08:00:00.000Z" });
    h.kv.set("kvk-handmatig:werker:u9", { kvkNumber: "55556666", naam: "Piet Jansen", notitie: "Op kvk.nl gezien", door: { id: "adm1", naam: "Anna" }, op: NU.toISOString() });
    h.gedaanProfielen = [{ userId: "u9", kvkNumber: "55556666", kvkValid: true, user: { fullName: "Piet Jansen" } }];
    // t2 is intussen gekoppeld aan een inschrijving: niets meer te controleren
    h.tenants = [
      { id: "t1", name: "Bakkerij Jansen", kvkNumber: null, companyRegistrationId: null },
      { id: "t2", name: "Al Gekoppeld", kvkNumber: "33334444", companyRegistrationId: "reg-2" },
    ];

    const o = await kvkControleOverzicht();
    expect(o.werkers.map((r) => [r.id, r.naam, r.kvkNumber, r.stand])).toEqual([
      ["u1", "Eva Bakker", "12345678", "wacht"],
      ["u2", "Tom Smit", "87654321", "opgegeven"],
    ]);
    expect(Object.keys(o.werkers[0] ?? {}).sort()).toEqual(["href", "id", "kvkNumber", "label", "naam", "sinds", "soort", "stand", "tone"]);
    expect(o.bedrijven.map((r) => [r.id, r.naam, r.kvkNumber])).toEqual([["t1", "Bakkerij Jansen", "11112222"]]);
    expect(o.gedaan).toHaveLength(1);
    expect(o.gedaan[0]).toMatchObject({ soort: "werker", id: "u9", naam: "Piet Jansen", nogGeldig: true, href: "/admin/gebruikers/u9" });
    expect(o.tegoed).toMatchObject({ op: true });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("privacy", () => {
  it("de goedkeuring van een werker is per gebruiker: ze gaat mee bij het wissen van het account", () => {
    expect(KVK_HANDMATIG_PREFIX).toBe("kvk-handmatig:");
    expect(ERASABLE_KV_PREFIXES).toContain("kvk-handmatig:werker:");
    expect(erasableKvWhere("u1").OR).toContainEqual({ key: { equals: "kvk-handmatig:werker:u1" } });
  });
});
