import { beforeEach, describe, expect, it, vi } from "vitest";

// Een uitzendkracht heeft geen KVK of btw nodig. Dat moet ook in de stappenlijst
// staan vóórdat er een profiel is: 9 nov liepen 8 uitzendkrachten vast op een
// lijst die om "KVK/btw" vroeg.

const findProfile = vi.fn();
const findUser = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { freelancerProfile: { findUnique: findProfile }, user: { findUnique: findUser }, webPushSubscription: { count: async () => 0 } } }));
const getFiscal = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal,
  isComplete: () => false,
  fiscaalIngevuld: () => false,
  invoiceModeFor: (f: { workerKind?: string }) => (f.workerKind === "uitzendkracht" ? "payroll" : "reverse-billing"),
}));
const activeUitzendContract = vi.fn();
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract }));

const { getFreelancerOverview } = await import("@/lib/dashboard/freelancer");
const { onboardingReminderEmail } = await import("@/lib/mail");

describe("stappenlijst zonder profiel", () => {
  beforeEach(() => {
    findProfile.mockResolvedValue(null);
    findUser.mockResolvedValue({ kycStatus: "NOT_STARTED" });
    activeUitzendContract.mockResolvedValue(null);
  });

  it("vraagt een uitzendkracht geen KVK of btw, maar de uitzendovereenkomst", async () => {
    getFiscal.mockResolvedValue({ workerKind: "uitzendkracht" });
    const o = await getFreelancerOverview("u1");
    const labels = o.onboarding.map((s) => s.label);
    expect(labels.join(" ")).not.toMatch(/KVK|btw/i);
    expect(labels).toContain("Uitzendovereenkomst ondertekend");
  });

  it("vraagt een zzp'er of flexwerker wel om KVK of btw", async () => {
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    const o = await getFreelancerOverview("u2");
    expect(o.onboarding.map((s) => s.label)).toContain("KVK/btw gekoppeld en gevalideerd");
  });
});

describe("herinneringsmail voor een uitzendkracht", () => {
  it("noemt geen KVK of btw, wel BSN en de uitzendovereenkomst", () => {
    const m = onboardingReminderEmail("Sam", "uitzendkracht", "https://zekerflex.com", 1);
    const tekst = `${m.subject} ${m.text ?? ""} ${m.html ?? ""}`;
    expect(tekst).not.toMatch(/KVK|btw-nummer/i);
    expect(tekst).toMatch(/BSN/);
    expect(tekst).toMatch(/uitzendovereenkomst/);
  });
});
