import { beforeEach, describe, expect, it, vi } from "vitest";

// De bellijst in Beheer → Sales (14 nov 2026): wie de eigenaar zelf kan bellen, en wat een uitkomst doet.

const h = vi.hoisted(() => ({
  leads: [] as Record<string, unknown>[],
  kv: new Map<string, unknown>(),
  updates: [] as { where: { id: string }; data: Record<string, unknown> }[],
  audits: [] as Record<string, unknown>[],
  suppressed: [] as string[],
  optouts: [] as string[],
  geannuleerd: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesLead: {
      findMany: async () => h.leads,
      findUnique: async ({ where }: { where: { id: string } }) => h.leads.find((l) => l.id === where.id) ?? null,
      update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        h.updates.push(a);
        return { ...h.leads.find((l) => l.id === a.where.id), ...a.data };
      },
    },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => h.kv.has(k)).map((k) => [k, h.kv.get(k)])),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void h.audits.push(a) }));
vi.mock("@/lib/sales/suppression", () => ({
  addSuppression: async (email: string) => void h.suppressed.push(email),
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
}));
vi.mock("@/lib/sales/reply", () => ({ cancelOpenOutreach: async (id: string) => void h.geannuleerd.push(id) }));
vi.mock("@/lib/telephony/consent", () => ({
  optoutKey: (n: string) => `tel:optout:${n.replace(/[^\d+]/g, "").replace(/^0/, "+31")}`,
  recordOptOut: async (n: string) => void h.optouts.push(n),
}));

import {
  BEL_MIN_SCORE,
  NIET_BELOVEN,
  belNotitie,
  belRang,
  belScript,
  opBelLijst,
  telHref,
  vergelijkBelRang,
  voegNotitieToe,
  volgendeWerkdag10,
  waaromPast,
} from "@/lib/sales/bellijst";
import { belLijst, legBelUitkomstVast } from "@/lib/sales/bellijst-server";
import { PRIJS_ZIN } from "@/lib/sales/prompts";

const NU = new Date("2026-11-14T13:00:00+01:00"); // zaterdag
const lead = (o: Record<string, unknown> = {}) => ({
  id: "l1",
  companyName: "Bakkerij Test",
  city: "Groningen",
  sector: "horeca",
  score: 70,
  contactPhone: "050 123 4567",
  contactEmail: null,
  discoveredEmail: null,
  status: "NEW",
  suppressed: false,
  vacancySignal: null,
  source: "openstreetmap",
  scoreRationale: "Horeca met piekdrukte.",
  notes: null,
  createdAt: new Date("2026-11-10T09:00:00+01:00"),
  ...o,
});

beforeEach(() => {
  h.leads = [];
  h.kv.clear();
  h.updates.length = 0;
  h.audits.length = 0;
  h.suppressed.length = 0;
  h.optouts.length = 0;
  h.geannuleerd.length = 0;
});

describe("wie op de bellijst staat", () => {
  it("een telefoon, score van 55 of hoger, nog geen reactie, niet onderdrukt", () => {
    expect(opBelLijst(lead(), null, NU)).toBe(true);
    expect(opBelLijst(lead({ score: BEL_MIN_SCORE - 1 }), null, NU)).toBe(false);
    expect(opBelLijst(lead({ score: null }), null, NU)).toBe(false);
    expect(opBelLijst(lead({ contactPhone: null }), null, NU)).toBe(false);
    expect(opBelLijst(lead({ contactPhone: "12" }), null, NU)).toBe(false);
    expect(opBelLijst(lead({ suppressed: true }), null, NU)).toBe(false);
    for (const status of ["REPLIED", "WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"]) expect(opBelLijst(lead({ status }), null, NU)).toBe(false);
    // al gemaild maar geen reactie: wel bellen
    expect(opBelLijst(lead({ status: "SENT", contactEmail: "info@bakkerij.test" }), null, NU)).toBe(true);
    // op de niet-bellen-lijst: nooit
    expect(opBelLijst(lead(), null, NU, true)).toBe(false);
  });

  it("na 'terugbellen' pas weer op het afgesproken moment", () => {
    expect(opBelLijst(lead(), { pogingen: 1, terugbellenOp: "2026-11-16T09:00:00Z" }, NU)).toBe(false);
    expect(opBelLijst(lead(), { pogingen: 1, terugbellenOp: "2026-11-14T11:00:00Z" }, NU)).toBe(true);
  });

  it("volgorde: afgesproken terugbellen, dan nooit gebeld (oudste eerst), dan geen gehoor", () => {
    const oud = new Date("2026-11-01T09:00:00Z");
    const nieuw = new Date("2026-11-12T09:00:00Z");
    const rangen = [
      belRang(nieuw, { pogingen: 1, laatste: { at: "2026-11-13T09:00:00Z", uitkomst: "geen-gehoor" } }),
      belRang(nieuw, null),
      belRang(oud, null),
      belRang(oud, { pogingen: 1, terugbellenOp: "2026-11-14T09:00:00Z" }),
    ];
    const volgorde = [...rangen].sort(vergelijkBelRang).map((r) => rangen.indexOf(r));
    expect(volgorde).toEqual([3, 2, 1, 0]);
  });
});

describe("hulpjes", () => {
  it("terugbellen: de volgende werkdag om 10:00 in Amsterdam", () => {
    // zaterdag → maandag 16 nov 10:00 (09:00 UTC); vrijdagavond ook
    expect(volgendeWerkdag10(NU).toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(volgendeWerkdag10(new Date("2026-11-13T22:30:00+01:00")).toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(volgendeWerkdag10(new Date("2026-11-17T08:00:00+01:00")).toISOString()).toBe("2026-11-18T09:00:00.000Z");
  });

  it("tel:-link in +31-vorm, en geen link voor onzin", () => {
    expect(telHref("050 123 4567")).toBe("tel:+31501234567");
    expect(telHref("+31 6 12345678")).toBe("tel:+31612345678");
    expect(telHref("0031501234567")).toBe("tel:+31501234567");
    expect(telHref("12")).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it("waarom hij past: het vacaturesignaal, anders de bron en de reden van de score", () => {
    expect(waaromPast({ vacancySignal: "Zoekt bediening voor de kerst", source: "careers", scoreRationale: null })).toBe("Vacature: Zoekt bediening voor de kerst");
    expect(waaromPast({ vacancySignal: null, source: "openstreetmap", scoreRationale: "Horeca met piekdrukte." })).toBe("Bron: OpenStreetMap · Horeca met piekdrukte.");
    expect(waaromPast({ vacancySignal: null, source: "constructor", scoreRationale: null })).toBe("Bron: constructor");
  });

  it("de notitie krijgt tijd en uitkomst, en de notities groeien niet onbeperkt", () => {
    expect(belNotitie("geen-gehoor", NU, "  na 14 uur  ")).toBe("[14-11 13:00] Gebeld: geen gehoor. na 14 uur");
    expect(voegNotitieToe("oud", "nieuw")).toBe("oud\nnieuw");
    expect(voegNotitieToe(null, "nieuw")).toBe("nieuw");
    expect(voegNotitieToe("x".repeat(5000), "nieuw").length).toBe(4000);
  });

  it("het belscript noemt de prijs uit de staffel en belooft niets wat er niet is", () => {
    const script = belScript().join("\n");
    expect(script).toContain(PRIJS_ZIN);
    expect(script).toContain("niet meer gebeld");
    expect(script).not.toMatch(/tegoed|voorschot|direct uitbetaald|snel uitbetaald|online betalen|verzekering/i);
    expect(NIET_BELOVEN).toMatch(/voorschot/);
  });
});

describe("de server", () => {
  it("de lijst: alleen wie er hoort, met een tel:-link en de stand; de niet-bellen-lijst telt mee", async () => {
    h.leads = [
      lead({ id: "a", createdAt: new Date("2026-11-02T09:00:00Z") }),
      lead({ id: "b", createdAt: new Date("2026-11-01T09:00:00Z"), contactPhone: "0612345678" }),
      lead({ id: "c", createdAt: new Date("2026-11-03T09:00:00Z") }),
    ];
    h.kv.set("tel:optout:+31612345678", { at: "x" });
    h.kv.set("sales-bel:c", { pogingen: 1, laatste: { at: "2026-11-13T09:00:00Z", uitkomst: "geen-gehoor" } });
    const regels = await belLijst(NU);
    expect(regels.map((r) => r.id)).toEqual(["a", "c"]);
    expect(regels[0]?.telHref).toBe("tel:+31501234567");
    expect(regels[1]?.laatste?.label).toBe("Geen gehoor");
    expect(regels[1]?.pogingen).toBe(1);
  });

  it("geen interesse: verloren, onderdrukt, geen mail meer (ook het adres) en het nummer op de niet-bellen-lijst", async () => {
    h.leads = [lead({ contactEmail: "Info@Bakkerij.test" })];
    await legBelUitkomstVast("l1", "geen-interesse", "admin1", undefined, NU);
    expect(h.updates[0]?.data).toMatchObject({ status: "LOST", suppressed: true, nextActionAt: null, lastContactedAt: NU });
    expect(h.suppressed).toEqual(["info@bakkerij.test"]);
    expect(h.optouts).toEqual(["050 123 4567"]);
    expect(h.geannuleerd).toEqual(["l1"]);
    expect(h.audits[0]).toMatchObject({ category: "SALES", action: "sales.lead.gebeld", targetId: "l1", actorUserId: "admin1" });
    expect(String(h.updates[0]?.data.notes)).toContain("Gebeld: geen interesse.");
  });

  it("interesse: 'Reactie ontvangen', open mails vervallen", async () => {
    h.leads = [lead()];
    await legBelUitkomstVast("l1", "interesse", "admin1", "wil een offerte", NU);
    expect(h.updates[0]?.data).toMatchObject({ status: "REPLIED", repliedAt: NU, nextActionAt: null });
    expect(h.geannuleerd).toEqual(["l1"]);
    expect(h.optouts).toEqual([]);
  });

  it("terugbellen en geen gehoor: de status blijft, nextActionAt (de mailplanning) blijft onaangeroerd", async () => {
    h.leads = [lead({ status: "SENT" })];
    await legBelUitkomstVast("l1", "terugbellen", "admin1", undefined, NU);
    expect(h.updates[0]?.data).not.toHaveProperty("status");
    expect(h.updates[0]?.data).not.toHaveProperty("nextActionAt");
    expect(h.kv.get("sales-bel:l1")).toMatchObject({ pogingen: 1, terugbellenOp: "2026-11-16T09:00:00.000Z" });
    await legBelUitkomstVast("l1", "geen-gehoor", "admin1", undefined, NU);
    // een nieuwe uitkomst haalt het oude terugbelmoment weg
    expect(h.kv.get("sales-bel:l1")).toEqual({ pogingen: 2, laatste: { at: NU.toISOString(), uitkomst: "geen-gehoor" } });
    expect(h.geannuleerd).toEqual([]);
  });

  it("een onbekende lead: niet gevonden", async () => {
    await expect(legBelUitkomstVast("weg", "geen-gehoor", "admin1")).rejects.toThrow("Lead niet gevonden.");
  });
});
