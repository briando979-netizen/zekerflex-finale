import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Introduceer een bedrijf" op de server (lib/introducties/opslag.ts) met een nagemaakte database en KV: indienen (nieuw,
// al een lead, al klant), koppelen aan een bedrijf (twee weken zonder platformkosten, eenmalig, eerste introductie krijgt
// de beloning) en de stand die de werker ziet.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  audits: [] as Record<string, unknown>[],
  leads: new Map<string, Record<string, unknown>>(),
  klant: null as null | { memberships: { tenantId: string }[] },
  bestaandeLead: null as null | Record<string, unknown>,
  tenants: new Map<string, { id: string; name: string; type: string }>(),
  betaald: null as null | Record<string, unknown>,
  createLead: vi.fn(),
  updates: [] as { where: { id: string }; data: Record<string, unknown> }[],
}));

const kopie = <T,>(v: T): T => structuredClone(v);
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? kopie(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, kopie(v)),
  kvSetIfAbsent: async (k: string, v: unknown) => (h.kv.has(k) ? false : (h.kv.set(k, kopie(v)), true)),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => h.kv.has(k)).map((k) => [k, kopie(h.kv.get(k))])),
  kvListEntries: async (p: string) => [...h.kv].filter(([k]) => k.startsWith(p)).map(([key, value]) => ({ key, value: kopie(value) })),
  kvListValues: async (p: string) => [...h.kv].filter(([k]) => k.startsWith(p)).map(([, v]) => kopie(v)),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void h.audits.push(a) }));
vi.mock("@/lib/sales/leads", () => ({ createLead: (...a: unknown[]) => h.createLead(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: async () => h.klant,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, fullName: id === "u1" ? "Wendy Werker" : "Gijs Werkgever", email: `${id}@zekerflex.test` })),
    },
    salesLead: {
      findFirst: async () => h.bestaandeLead,
      findUnique: async ({ where }: { where: { id: string } }) => h.leads.get(where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => h.leads.get(id)).filter(Boolean),
      update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        h.updates.push(a);
        const l = { ...(h.leads.get(a.where.id) ?? { id: a.where.id }), ...a.data };
        h.leads.set(a.where.id, l);
        return l;
      },
    },
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => h.tenants.get(where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => h.tenants.get(id)).filter(Boolean),
    },
    invoice: { findFirst: async () => h.betaald },
  },
}));

import { alleIntroducties, dienIntroductieIn, koppelIntroductie, mijnIntroducties } from "@/lib/introducties/opslag";
import { introductieZonderFee } from "@/lib/introducties/vrijstelling";
import { beloonIntroductieNaBetaling } from "@/lib/introducties/beloning";

const NU = new Date("2026-11-17T09:05:00+01:00");
const invoer = (extra: Record<string, unknown> = {}) => ({
  userId: "u1",
  eigenEmail: "u1@zekerflex.test",
  rol: "werker" as const,
  contactNaam: "Piet de Vries",
  bedrijf: "Bakkerij De Korf",
  email: "piet@dekorf.nl" as string | null,
  telefoon: "+31612345678" as string | null,
  ...extra,
});

beforeEach(() => {
  h.kv.clear();
  h.audits.length = 0;
  h.leads.clear();
  h.updates.length = 0;
  h.klant = null;
  h.bestaandeLead = null;
  h.betaald = null;
  h.tenants.clear();
  h.tenants.set("t1", { id: "t1", name: "Bakkerij De Korf B.V.", type: "ENTERPRISE_HQ" });
  h.tenants.set("t2", { id: "t2", name: "Ander Bedrijf", type: "ENTERPRISE_HQ" });
  h.tenants.set("tp", { id: "tp", name: "ZekerFlex", type: "PLATFORM" });
  h.createLead.mockReset();
  h.createLead.mockImplementation(async (i: Record<string, unknown>) => {
    const id = `lead-${h.leads.size + 1}`;
    h.leads.set(id, { id, status: "NEW", lastContactedAt: null, suppressed: false, invitedTenantId: null, notes: i.notes ?? null, contactEmail: i.contactEmail ?? null, contactPhone: i.contactPhone ?? null, enrichmentJson: {} });
    return { id };
  });
});
afterEach(() => vi.useRealTimers());

describe("indienen", () => {
  it("een nieuw bedrijf: een lead met bron introductie, zonder campagne (dus nooit vanzelf gemaild), score 80, en in de eigen lijst", async () => {
    const uit = await dienIntroductieIn(invoer(), NU);
    expect(uit.uitkomst).toBe("nieuw");
    expect(h.createLead).toHaveBeenCalledTimes(1);
    const lead = h.createLead.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(lead).toMatchObject({ companyName: "Bakkerij De Korf", contactName: "Piet de Vries", contactEmail: "piet@dekorf.nl", contactPhone: "+31612345678", source: "introductie", createdById: "u1", score: 80 });
    expect(Object.keys(lead)).not.toContain("campaignId");
    expect(String(lead.notes)).not.toContain("Wendy");
    const lijst = h.kv.get("introducties:u1") as { id: string; leadId: string; bestondAl: boolean; alKlantTenantId: string | null }[];
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ leadId: "lead-1", bestondAl: false, alKlantTenantId: null });
    // het adres en nummer van de contactpersoon staan alleen in de lead, niet in de lijst van wie het voorstelde
    expect(JSON.stringify(lijst)).not.toMatch(/piet@dekorf\.nl|\+31612345678/);
    expect(uit.introducties).toEqual([{ id: lijst[0]?.id, at: NU.toISOString(), bedrijf: "Bakkerij De Korf", contactNaam: "Piet de Vries", status: "ingediend" }]);
  });

  it("al een lead (zelfde domein): geen tweede lead; alleen lege velden aangevuld en een notitie", async () => {
    h.bestaandeLead = { id: "lead-osm", companyName: "De Korf", contactName: null, contactEmail: "info@dekorf.nl", contactPhone: null, notes: "oud", enrichmentJson: { sbiCodes: ["1071"] } };
    h.leads.set("lead-osm", { id: "lead-osm", status: "NEW", lastContactedAt: null, suppressed: false, invitedTenantId: null, contactEmail: "info@dekorf.nl", contactPhone: null, enrichmentJson: { sbiCodes: ["1071"] } });
    const uit = await dienIntroductieIn(invoer(), NU);
    expect(uit.uitkomst).toBe("bestaande-lead");
    expect(h.createLead).not.toHaveBeenCalled();
    const upd = h.updates[0]?.data ?? {};
    expect(upd.contactName).toBe("Piet de Vries");
    expect(upd.contactPhone).toBe("+31612345678");
    expect(upd).not.toHaveProperty("contactEmail");
    expect(String(upd.notes)).toMatch(/^oud\n\[17-11 09:05\] Introductie via een werker/);
    const intro = (h.kv.get("introducties:u1") as { id: string; leadId: string; bestondAl: boolean }[])[0];
    expect(intro).toMatchObject({ leadId: "lead-osm", bestondAl: true });
    // het eigen contact van deze introductie staat bij de lead; de verrijking die er al was blijft
    expect(upd.enrichmentJson).toEqual({
      sbiCodes: ["1071"],
      introductieContacten: [{ introId: intro?.id, at: NU.toISOString(), contactNaam: "Piet de Vries", email: "piet@dekorf.nl", telefoon: "+31612345678" }],
    });
    expect(h.audits.map((a) => a.action)).toEqual(["sales.introductie.ingediend"]);
    // Beheer ziet het adres van deze introductie, niet info@
    expect((await alleIntroducties())[0]).toMatchObject({ email: "piet@dekorf.nl", telefoon: "+31612345678", bestondAl: true });
  });

  it("al klant: geen lead, alleen vastgelegd, met de stand 'was al klant'", async () => {
    h.klant = { memberships: [{ tenantId: "t1" }] };
    const uit = await dienIntroductieIn(invoer(), NU);
    expect(uit.uitkomst).toBe("al-klant");
    expect(h.createLead).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(0);
    expect(uit.introducties[0]?.status).toBe("al-klant");
  });

  it("jezelf, twee keer hetzelfde bedrijf, of meer dan het maximum: 422 met het veld", async () => {
    await expect(dienIntroductieIn(invoer({ email: "u1@zekerflex.test" }), NU)).rejects.toMatchObject({ status: 422, details: { veld: "zelf" } });
    await dienIntroductieIn(invoer(), NU);
    // de database vindt de lead van de eerste keer terug (zelfde nummer): dan is het hetzelfde bedrijf
    h.bestaandeLead = { id: "lead-1", companyName: "Bakkerij De Korf", contactName: "Piet de Vries", contactEmail: "piet@dekorf.nl", contactPhone: "+31612345678", notes: null, enrichmentJson: {} };
    await expect(dienIntroductieIn(invoer({ email: null }), NU)).rejects.toMatchObject({ status: 422, details: { veld: "dubbel" } });
    // en een tweede keer hetzelfde klantbedrijf ook
    h.klant = { memberships: [{ tenantId: "t1" }] };
    await dienIntroductieIn(invoer({ userId: "u3", eigenEmail: "u3@zekerflex.test" }), NU);
    await expect(dienIntroductieIn(invoer({ userId: "u3", eigenEmail: "u3@zekerflex.test", contactNaam: "Anna" }), NU)).rejects.toMatchObject({ details: { veld: "dubbel" } });
    h.klant = null;
    h.kv.set("introducties:u2", Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, at: NU.toISOString(), email: `a${i}@b.nl`, telefoon: null })));
    await expect(dienIntroductieIn(invoer({ userId: "u2", eigenEmail: "u2@zekerflex.test" }), NU)).rejects.toMatchObject({ status: 422, details: { veld: "vol" } });
  });
});

describe("koppelen aan een bedrijf", () => {
  async function tweeIntroducties() {
    await dienIntroductieIn(invoer(), new Date("2026-11-10T10:00:00+01:00"));
    h.bestaandeLead = { id: "lead-1", companyName: "Bakkerij De Korf", contactName: "Piet de Vries", contactEmail: "piet@dekorf.nl", contactPhone: "+31612345678", notes: null };
    await dienIntroductieIn(invoer({ userId: "u2", eigenEmail: "u2@zekerflex.test", rol: "werkgever" }), new Date("2026-11-12T10:00:00+01:00"));
  }

  it("de eerste introductie krijgt de beloning; twee weken geen platformkosten vanaf vandaag; lead gewonnen; in het auditspoor", async () => {
    await tweeIntroducties();
    const eerste = (h.kv.get("introducties:u1") as { id: string }[])[0]!;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NU);
    const k = await koppelIntroductie({ leadId: "lead-1", tenantId: "t1", actorUserId: "admin" });
    expect(k).toMatchObject({ tenantId: "t1", leadId: "lead-1", introId: eerste.id, userId: "u1", gratisVanaf: "2026-11-17", gratisTot: "2026-12-01", door: "admin" });
    expect(h.kv.get("introductie-klant:t1")).toEqual(k);
    expect(h.leads.get("lead-1")).toMatchObject({ status: "WON", invitedTenantId: "t1", nextActionAt: null });
    expect(String(h.leads.get("lead-1")?.notes)).toContain("Gekoppeld aan bedrijf Bakkerij De Korf B.V.: geen platformkosten tot en met 2026-11-30.");
    const audit = h.audits.find((a) => a.action === "sales.introductie.gekoppeld");
    expect(audit).toMatchObject({ actorUserId: "admin", targetType: "tenant", targetId: "t1" });

    // de dienst bepaalt de korting: binnen de twee weken wel, daarna en ervoor niet; een ander bedrijf nooit
    expect(await introductieZonderFee("t1", new Date("2026-11-30T20:00:00+01:00"))).toBe(true);
    expect(await introductieZonderFee("t1", new Date("2026-12-01T08:00:00+01:00"))).toBe(false);
    expect(await introductieZonderFee("t1", new Date("2026-11-16T08:00:00+01:00"))).toBe(false);
    expect(await introductieZonderFee("t2", new Date("2026-11-20T08:00:00+01:00"))).toBe(false);

    // de stand: de eerste is klant geworden, de tweede was later
    expect((await mijnIntroducties("u1"))[0]?.status).toBe("klant");
    expect((await mijnIntroducties("u2"))[0]?.status).toBe("eerder");
  });

  it("nog een keer koppelen verandert niets; een ander bedrijf of een andere lead op hetzelfde bedrijf: 409", async () => {
    await tweeIntroducties();
    const k = await koppelIntroductie({ leadId: "lead-1", tenantId: "t1", actorUserId: "admin" }, NU);
    const audits = h.audits.length;
    expect(await koppelIntroductie({ leadId: "lead-1", tenantId: "t1", actorUserId: "admin" }, new Date("2026-11-20T09:00:00+01:00"))).toEqual(k);
    expect(h.audits.length).toBe(audits);
    await expect(koppelIntroductie({ leadId: "lead-1", tenantId: "t2", actorUserId: "admin" }, NU)).rejects.toMatchObject({ status: 409 });
    h.leads.set("lead-ander", { id: "lead-ander", status: "NEW", notes: null, invitedTenantId: null });
    h.kv.set("introducties:u3", [{ id: "i3", at: NU.toISOString(), leadId: "lead-ander", alKlantTenantId: null, bedrijf: "X" }]);
    await expect(koppelIntroductie({ leadId: "lead-ander", tenantId: "t1", actorUserId: "admin" }, NU)).rejects.toMatchObject({ status: 409 });
  });

  it("geen platformorganisatie, geen onbekende lead, en geen lead zonder introductie", async () => {
    await tweeIntroducties();
    await expect(koppelIntroductie({ leadId: "lead-1", tenantId: "tp", actorUserId: "admin" }, NU)).rejects.toMatchObject({ status: 404 });
    await expect(koppelIntroductie({ leadId: "lead-weg", tenantId: "t1", actorUserId: "admin" }, NU)).rejects.toMatchObject({ status: 404 });
    h.leads.set("lead-zonder", { id: "lead-zonder", status: "NEW", notes: null, invitedTenantId: null });
    await expect(koppelIntroductie({ leadId: "lead-zonder", tenantId: "t1", actorUserId: "admin" }, NU)).rejects.toMatchObject({ status: 422 });
    expect(h.kv.has("introductie-klant:t1")).toBe(false);
  });
});

describe("de beloning", () => {
  it("de eerste betaalde factuur voor platformkosten maakt de beloning verschuldigd, één keer; afvinken = verstuurd", async () => {
    await dienIntroductieIn(invoer(), NU);
    await koppelIntroductie({ leadId: "lead-1", tenantId: "t1", actorUserId: "admin" }, NU);
    const introId = (h.kv.get("introducties:u1") as { id: string }[])[0]!.id;

    // € 0 uit de gratis weken, een andere soort, of een ander bedrijf: niets
    expect(await beloonIntroductieNaBetaling({ id: "f0", number: "ZF-PF-0", type: "PLATFORM_FEE", totalCents: 0, recipientTenantId: "t1" })).toBe(false);
    expect(await beloonIntroductieNaBetaling({ id: "f1", number: "ZF-SB-1", type: "SELF_BILL_FREELANCER", totalCents: 4235, recipientTenantId: "t1" })).toBe(false);
    expect(await beloonIntroductieNaBetaling({ id: "f2", number: "ZF-PF-2", type: "PLATFORM_FEE", totalCents: 4235, recipientTenantId: "t2" })).toBe(false);
    expect(await beloonIntroductieNaBetaling({ id: "f3", number: "ZF-PF-3", type: "PLATFORM_FEE", totalCents: 4235, recipientTenantId: null })).toBe(false);
    expect(h.kv.has("introductie-beloning:t1")).toBe(false);

    const betaald = new Date("2026-12-05T10:00:00+01:00");
    expect(await beloonIntroductieNaBetaling({ id: "f4", number: "ZF-PF-4", type: "PLATFORM_FEE", totalCents: 4235, recipientTenantId: "t1" }, betaald)).toBe(true);
    // Stripe stuurt dubbel, of de tweede factuur: niets meer
    expect(await beloonIntroductieNaBetaling({ id: "f4", number: "ZF-PF-4", type: "PLATFORM_FEE", totalCents: 4235, recipientTenantId: "t1" })).toBe(false);
    expect(await beloonIntroductieNaBetaling({ id: "f5", number: "ZF-PF-5", type: "PLATFORM_FEE", totalCents: 999, recipientTenantId: "t1" })).toBe(false);
    expect(h.kv.get("introductie-beloning:t1")).toMatchObject({ introId, userId: "u1", factuurId: "f4", factuurNummer: "ZF-PF-4", betaaldOp: betaald.toISOString() });
    expect(h.audits.filter((a) => a.action === "sales.introductie.beloning")).toHaveLength(1);
    expect((await mijnIntroducties("u1"))[0]?.status).toBe("beloning-onderweg");

    // de eigenaar vinkt de taak af in Te doen
    h.kv.set("owner-todos:done", { [`intro-bol:${introId}`]: { at: "2026-12-06T09:00:00.000Z", by: "Eigenaar" } });
    expect((await mijnIntroducties("u1"))[0]?.status).toBe("beloning-verstuurd");
    const rij = (await alleIntroducties())[0];
    expect(rij?.beloning).toEqual({ factuurNummer: "ZF-PF-4", betaaldOp: betaald.toISOString(), verstuurd: true, todoId: `intro-bol:${introId}` });
    expect(rij?.koppeling).toMatchObject({ tenantId: "t1", naam: "Bakkerij De Korf B.V.", gratisVanaf: "2026-11-17", laatsteGratisDag: "2026-11-30" });
    expect(rij?.door).toEqual({ userId: "u1", naam: "Wendy Werker", email: "u1@zekerflex.test" });
  });

  it("betaalde het bedrijf al vóór het koppelen, dan is de beloning meteen verschuldigd", async () => {
    await dienIntroductieIn(invoer(), NU);
    h.betaald = { id: "f9", number: "ZF-PF-9", type: "PLATFORM_FEE", totalCents: 2800, recipientTenantId: "t1", paidAt: new Date("2026-11-15T12:00:00+01:00") };
    await koppelIntroductie({ leadId: "lead-1", tenantId: "t1", actorUserId: "admin" }, NU);
    expect(h.kv.get("introductie-beloning:t1")).toMatchObject({ factuurId: "f9", betaaldOp: "2026-11-15T11:00:00.000Z" });
  });

  it("een storing in de opslag houdt een betaling of goedkeuring nooit tegen", async () => {
    h.kv.set("introductie-klant:t1", { gratisVanaf: "2026-11-17", gratisTot: "2026-12-01" });
    const echt = h.kv.get.bind(h.kv);
    const spion = vi.spyOn(h.kv, "get").mockImplementation(() => {
      throw new Error("db weg");
    });
    await expect(beloonIntroductieNaBetaling({ id: "f1", number: "ZF-PF-1", type: "PLATFORM_FEE", totalCents: 4235, recipientTenantId: "t1" })).resolves.toBe(false);
    await expect(introductieZonderFee("t1", new Date("2026-11-20T10:00:00+01:00"))).resolves.toBe(false);
    spion.mockRestore();
    expect(echt("introductie-klant:t1")).toBeTruthy();
  });
});
