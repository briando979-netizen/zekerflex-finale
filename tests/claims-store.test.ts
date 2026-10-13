import { afterEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the Postgres-backed KV store, keyed exactly like the
// real kvGet/kvSet/kvListValues so lib/claims/store.ts can't tell the difference.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (key: string) => kv.get(key) ?? null),
  kvSet: vi.fn(async (key: string, value: unknown) => {
    kv.set(key, value);
  }),
  kvListValues: vi.fn(async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)),
}));

import {
  fileClaim,
  offerEmployerClaim,
  decideClaim,
  decideOfferedClaim,
  claimsAwaitingPayment,
  claimsInIncasso,
  attachClaimInvoice,
  markClaimEscalated,
  type CancellationClaim,
} from "@/lib/claims/store";

afterEach(() => {
  kv.clear();
  vi.clearAllMocks();
});

describe("freelancer_owed claims (employer cancelled, freelancer files)", () => {
  it("defaults the claimed amount to 50% of the shift value", async () => {
    const claim = await fileClaim({
      shiftId: "s1",
      shiftTitle: "Horeca shift",
      assignmentId: "a1",
      freelancerUserId: "f1",
      freelancerName: "Jan",
      employerUserId: "e1",
      employerTenantId: "t1",
      debtorUserId: "e1",
      branchName: "Vestiging A",
      shiftValueCents: 10_000,
      reason: "Opdrachtgever annuleerde",
    });

    expect(claim.direction).toBe("freelancer_owed");
    expect(claim.claimedCents).toBe(5_000);
    expect(claim.status).toBe("filed");
    expect(claim.debtorUserId).toBe("e1");
    expect(claim.debtorFreelancerId).toBeNull();
  });

  it("decideClaim only acts on a claim that is still filed", async () => {
    const claim = await fileClaim({
      shiftId: "s1",
      shiftTitle: "x",
      assignmentId: "a1",
      freelancerUserId: "f1",
      freelancerName: "Jan",
      employerUserId: "e1",
      employerTenantId: "t1",
      debtorUserId: "e1",
      branchName: "B",
      shiftValueCents: 10_000,
      reason: "x",
    });

    const approved = await decideClaim(claim.id, "approved", "e1");
    expect(approved?.status).toBe("approved");

    // Already decided — a second decision is a no-op, not an override.
    const second = await decideClaim(claim.id, "rejected", "e1");
    expect(second).toBeNull();
  });
});

describe("employer_owed claims (freelancer late-cancels/no-shows, employer decides)", () => {
  async function offer(): Promise<CancellationClaim> {
    return offerEmployerClaim({
      shiftId: "s2",
      shiftTitle: "Magazijn shift",
      assignmentId: "a2",
      freelancerUserId: "f2",
      freelancerName: "Piet",
      freelancerProfileId: "fp2",
      employerUserId: "e2",
      employerTenantId: "t2",
      branchName: "Vestiging B",
      shiftValueCents: 20_000,
      reason: "Te laat afgezegd",
    });
  }

  it("is created in 'offered' status with nothing charged yet", async () => {
    const claim = await offer();
    expect(claim.direction).toBe("employer_owed");
    expect(claim.status).toBe("offered");
    expect(claim.claimedCents).toBe(10_000);
    expect(claim.debtorUserId).toBe("f2");
    expect(claim.debtorFreelancerId).toBe("fp2");
  });

  it("accepting moves it to 'filed' so billing can kick in", async () => {
    const claim = await offer();
    const decided = await decideOfferedClaim(claim.id, "accepted", "e2");
    expect(decided?.status).toBe("filed");
  });

  it("declining withdraws it — nothing is ever charged", async () => {
    const claim = await offer();
    const decided = await decideOfferedClaim(claim.id, "declined", "e2");
    expect(decided?.status).toBe("withdrawn");
  });

  it("can't be decided twice", async () => {
    const claim = await offer();
    await decideOfferedClaim(claim.id, "accepted", "e2");
    const again = await decideOfferedClaim(claim.id, "declined", "e2");
    expect(again).toBeNull();
  });
});

describe("collections queries", () => {
  it("claimsAwaitingPayment only returns claims with an invoice that aren't settled", async () => {
    const claim = await fileClaim({
      shiftId: "s3",
      shiftTitle: "x",
      assignmentId: "a3",
      freelancerUserId: "f3",
      freelancerName: "x",
      employerUserId: "e3",
      employerTenantId: "t3",
      debtorUserId: "e3",
      branchName: "B",
      shiftValueCents: 10_000,
      reason: "x",
    });

    expect(await claimsAwaitingPayment()).toHaveLength(0); // no invoice yet

    await attachClaimInvoice(claim.id, "inv_1");
    expect(await claimsAwaitingPayment()).toHaveLength(1);
  });

  it("claimsInIncasso only returns escalated, unresolved dossiers", async () => {
    const claim = await fileClaim({
      shiftId: "s4",
      shiftTitle: "x",
      assignmentId: "a4",
      freelancerUserId: "f4",
      freelancerName: "x",
      employerUserId: "e4",
      employerTenantId: "t4",
      debtorUserId: "e4",
      branchName: "B",
      shiftValueCents: 10_000,
      reason: "x",
    });

    expect(await claimsInIncasso()).toHaveLength(0);
    await markClaimEscalated(claim.id, 40_00);
    expect(await claimsInIncasso()).toHaveLength(1);
  });
});
