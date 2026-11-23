import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De wegen waarlangs een werker in de app reageert, bij een bedrijf dat nog niet is gecontroleerd (23 nov 2026): "Aannemen", een reeks
// dagen, reageren met een tarief of opmerking, en het antwoord op een spoedoproep. Een reactie gaat nooit verloren; de werker leest
// overal dezelfde eerlijke tekst: "Je reactie staat klaar; het bedrijf ziet hem en bevestigt." Alleen het inplannen wacht op de poort.

const h = vi.hoisted(() => ({
  uitkomst: [] as ({ pendingCompanyVerification?: boolean } | Error)[],
  kv: new Map<string, unknown>(),
  taken: vi.fn(),
  mail: vi.fn(async () => ({ delivered: true })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1", fullName: "Sanne de Vries" }), requireRole: () => undefined }));
vi.mock("@/lib/matching/apply", () => ({
  applyToShift: async () => {
    const volgende = h.uitkomst.shift();
    if (volgende instanceof Error) throw volgende;
    return { status: "ACCEPTED", shiftFilled: false, ...volgende };
  },
}));
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: async () => ({ ok: true, track: "invoice", reason: null }) }));
// geen prisma.tenant en geen verificatie-mock: een reactie mag nergens op de controle van het bedrijf stuklopen
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findUnique: async () => ({
        title: "Bediening",
        hourlyRateCents: 1800,
        status: "OPEN",
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        viaUitzendbureau: false,
        branch: { name: "Café Zuid", tenantId: "t1", tenant: { name: "Café BV" } },
      }),
    },
    freelancerProfile: { findUnique: async () => ({ id: "fp1" }) },
    shiftAssignment: { findFirst: async () => null },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListValues: async (prefix: string) => [...h.kv].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));
vi.mock("@/lib/pools/vaste-schil", () => ({ probeerVasteSchil: async () => ({ ingepland: false }) }));
vi.mock("@/lib/notifications/employer-push", () => ({ pushShiftTaken: (...a: unknown[]) => h.taken(...a) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => (h.mail as (...x: unknown[]) => Promise<unknown>)(...a) }));
vi.mock("@/lib/env", () => ({ env: { MAIL_ADMIN: "beheer@zekerflex.nl" } }));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerTenant: async () => false }));
vi.mock("@/lib/uitzend/aanvraag", () => ({ meldUitzendcontractAanvraag: async () => undefined }));

const { applyToShiftAction, applyToSeriesAction, counterOfferAction } = await import("@/app/dashboard/klussen/actions");
const { REACTIE_KLAAR_TEKST } = await import("@/lib/matching/reactie");
const { listCounterOffers } = await import("@/lib/offers/store");
const { WORKER_PUSH } = await import("@/lib/i18n/worker-push");
const { AppError } = await import("@/lib/errors");

const WACHT = { pendingCompanyVerification: true };

beforeEach(() => {
  vi.clearAllMocks();
  h.uitkomst = [];
  h.kv.clear();
});

describe("Aannemen (applyToShiftAction)", () => {
  it("bij een bedrijf dat nog niet is gecontroleerd: ok, de eerlijke tekst, en het bedrijf krijgt geen 'neemt je klus'", async () => {
    h.uitkomst = [WACHT];
    const r = await applyToShiftAction("shift1");
    expect(r).toEqual({ ok: true, message: REACTIE_KLAAR_TEKST });
    expect(REACTIE_KLAAR_TEKST).toBe("Je reactie staat klaar; het bedrijf ziet hem en bevestigt.");
    expect(h.taken).not.toHaveBeenCalled();
  });

  it("bij een gecontroleerd bedrijf: aangenomen, en het bedrijf hoort het", async () => {
    h.uitkomst = [{}];
    const r = await applyToShiftAction("shift1");
    expect(r.message).toContain("Aangenomen");
    expect(h.taken).toHaveBeenCalledTimes(1);
  });
});

describe("een reeks dagen (applyToSeriesAction)", () => {
  it("alle dagen bij een bedrijf dat nog niet is gecontroleerd: één eerlijke tekst, en niets 'aangenomen'", async () => {
    h.uitkomst = [WACHT, WACHT, WACHT];
    const r = await applyToSeriesAction(["a", "b", "c"]);
    expect(r).toEqual({ ok: true, message: REACTIE_KLAAR_TEKST });
    expect(h.taken).not.toHaveBeenCalled();
  });

  it("een mengeling: de ingeplande dagen en de wachtende dagen worden apart genoemd, en het bedrijf hoort alleen over de ingeplande", async () => {
    h.uitkomst = [{}, WACHT, WACHT];
    const r = await applyToSeriesAction(["a", "b", "c"]);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Aangenomen voor 1 dag.");
    expect(r.message).toContain("Voor 2 dagen staat je reactie klaar");
    expect(h.taken).toHaveBeenCalledWith("a", "Sanne de Vries", 1);
  });

  it("een dag die niet lukt telt niet mee, en een wachtende dag blijft een gelukte reactie", async () => {
    h.uitkomst = [WACHT, AppError.conflict("Deze dienst is al vol.")];
    const r = await applyToSeriesAction(["a", "b"]);
    expect(r.ok).toBe(true);
    expect(r.message).toContain(REACTIE_KLAAR_TEKST);
    expect(r.message).toContain("1 dag(en) lukten niet");
  });

  it("alles aangenomen bij een gecontroleerd bedrijf: de tekst zoals altijd", async () => {
    h.uitkomst = [{}, {}];
    expect((await applyToSeriesAction(["a", "b"])).message).toBe("Aangenomen voor 2 dagen.");
  });
});

describe("reageren met een tarief of opmerking (counterOfferAction)", () => {
  it("bij een bedrijf dat nog niet is gecontroleerd wordt de reactie gewoon vastgelegd: geen controle in de weg, en hij staat bij het bedrijf", async () => {
    const r = await counterOfferAction("shift1", 2000, "Ik kan om 10 uur beginnen");
    expect(r.ok).toBe(true);
    const reacties = await listCounterOffers();
    expect(reacties).toHaveLength(1);
    expect(reacties[0]).toMatchObject({ userId: "u1", shiftId: "shift1", status: "pending", proposedRateCents: 2000, listedRateCents: 1800, note: "Ik kan om 10 uur beginnen" });
  });
});

describe("de teksten in de werker-pushes (vijf talen)", () => {
  it("een antwoord op een spoedoproep en de melding na de controle zeggen niet meer dat de reactie 'genoteerd' is, maar dat het bedrijf hem ziet en bevestigt", () => {
    for (const [taal, t] of Object.entries(WORKER_PUSH)) {
      const wacht = t.spoedPending("Bediening");
      const klaar = t.verifiedBody("Café BV", "Bediening");
      expect(wacht, taal).toContain("Bediening");
      expect(klaar, taal).toContain("Bediening");
      expect(wacht + klaar, taal).not.toMatch(/genoteerd|is noted|zapisana|notat|записано|goedgekeurd|zatwierdzon|aprobat|схвалено/i);
    }
    expect(WORKER_PUSH.nl.spoedPending("Bediening")).toBe("Je reactie op Bediening staat klaar; het bedrijf ziet hem en bevestigt.");
  });

  it("de spoedoproep gebruikt die tekst alleen bij een bedrijf dat nog niet is gecontroleerd", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/spoed/oproep.ts"), "utf8");
    expect(bron).toContain("uit.pendingCompanyVerification ? t.spoedPending(shift.title) : t.spoedAccepted(");
  });
});
