import { afterEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (key: string) => kv.get(key) ?? null),
  kvSet: vi.fn(async (key: string, value: unknown) => {
    kv.set(key, value);
  }),
  kvListValues: vi.fn(async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)),
}));

import {
  createTeamInvite,
  verifyTeamInviteToken,
  getTeamInvite,
  listPendingTeamInvites,
  revokeTeamInvite,
  markTeamInviteAccepted,
} from "@/lib/team/invite";

afterEach(() => {
  kv.clear();
  vi.clearAllMocks();
});

const BASE = {
  tenantId: "t1",
  tenantName: "Acme BV",
  email: "Collega@Example.com",
  role: "LOCAL_MANAGER" as const,
  branchIds: ["b1", "b2"],
  invitedByUserId: "u1",
  invitedByName: "Anna",
};

describe("createTeamInvite / verifyTeamInviteToken", () => {
  it("round-trips the invite through a signed token", async () => {
    const { token, record } = await createTeamInvite(BASE);
    expect(record.email).toBe("collega@example.com"); // lowercased

    const payload = await verifyTeamInviteToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe("t1");
    expect(payload!.email).toBe("collega@example.com");
    expect(payload!.role).toBe("LOCAL_MANAGER");
    expect(payload!.branchIds).toEqual(["b1", "b2"]);
  });

  it("rejects a garbage token", async () => {
    expect(await verifyTeamInviteToken("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different issuer", async () => {
    const { SignJWT } = await import("jose");
    const { env } = await import("@/lib/env");
    const token = await new SignJWT({ id: "x", tenantId: "t1", tenantName: "x", email: "a@b.nl", role: "HQ_ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("someone.else")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(env.AUTH_SECRET));
    expect(await verifyTeamInviteToken(token)).toBeNull();
  });
});

describe("listPendingTeamInvites / revokeTeamInvite / markTeamInviteAccepted", () => {
  it("only lists invites still pending", async () => {
    const { record: a } = await createTeamInvite(BASE);
    const { record: b } = await createTeamInvite({ ...BASE, email: "other@example.com" });

    await revokeTeamInvite(BASE.tenantId, a.id);
    const pending = await listPendingTeamInvites(BASE.tenantId);

    expect(pending.map((r) => r.id)).toEqual([b.id]);
  });

  it("a revoked invite's token still decodes, but the record is no longer pending", async () => {
    const { token, record } = await createTeamInvite(BASE);
    await revokeTeamInvite(BASE.tenantId, record.id);

    const payload = await verifyTeamInviteToken(token);
    expect(payload).not.toBeNull(); // the JWT itself has no concept of revocation

    const stored = await getTeamInvite(BASE.tenantId, record.id);
    expect(stored!.status).toBe("revoked"); // callers must check this before honouring the token
  });

  it("marks an invite accepted", async () => {
    const { record } = await createTeamInvite(BASE);
    await markTeamInviteAccepted(BASE.tenantId, record.id);
    const stored = await getTeamInvite(BASE.tenantId, record.id);
    expect(stored!.status).toBe("accepted");
  });
});
