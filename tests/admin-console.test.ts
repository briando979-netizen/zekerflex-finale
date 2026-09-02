import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) -----------------------------------------------------
const chatJson = vi.fn();
const chat = vi.fn();
const redisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/lib/ai/client", () => ({
  chatJson: (...a: unknown[]) => chatJson(...a),
  chat: (...a: unknown[]) => chat(...a),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/redis", () => ({ redis: { set: (...a: unknown[]) => redisSet(...a) } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import { AppError } from "@/lib/errors";
import { buildCatalog } from "@/lib/admin-console/parser";
import { parseIntent } from "@/lib/admin-console/parser";
import {
  mintConfirmToken,
  verifyConfirmToken,
} from "@/lib/admin-console/advisory";
import { confirmAdminConsole, runAdminConsole } from "@/lib/admin-console";

const principal = {
  userId: "usr_admin",
  email: "admin@zekerflex.nl",
  fullName: "Admin",
  grants: [],
  memberships: [],
  managedBranchIds: [],
} as unknown as Parameters<typeof runAdminConsole>[0]["principal"];

afterEach(() => {
  vi.clearAllMocks();
  redisSet.mockResolvedValue("OK");
});

describe("buildCatalog", () => {
  it("lists every registered query and mutation", () => {
    const cat = buildCatalog();
    expect(cat).toContain("platform_kpis [query]");
    expect(cat).toContain("search_freelancers [query]");
    expect(cat).toContain("deactivate_inactive_freelancers [mutation]");
    expect(cat).toContain("block_freelancer_matching [mutation]");
  });
});

describe("confirm tokens", () => {
  it("round-trips action + params + operator", async () => {
    const token = await mintConfirmToken({
      action: "cancel_past_due_open_shifts",
      params: {},
      actorUserId: "usr_admin",
    });
    const claim = await verifyConfirmToken(token);
    expect(claim).toMatchObject({
      action: "cancel_past_due_open_shifts",
      params: {},
      actorUserId: "usr_admin",
    });
    expect(claim.jti).toMatch(/[0-9a-f-]{36}/);
  });

  it("rejects a tampered token", async () => {
    const token = await mintConfirmToken({
      action: "cancel_past_due_open_shifts",
      params: {},
      actorUserId: "usr_admin",
    });
    await expect(verifyConfirmToken(token + "x")).rejects.toBeInstanceOf(AppError);
  });
});

describe("parseIntent", () => {
  it("passes through a valid query choice", async () => {
    chatJson.mockResolvedValueOnce({ kind: "query", name: "platform_kpis", params: {} });
    expect(await parseIntent("hoeveel open shifts zijn er?")).toEqual({
      kind: "query",
      name: "platform_kpis",
      params: {},
    });
  });

  it("maps a hallucinated action name to unknown", async () => {
    chatJson.mockResolvedValueOnce({ kind: "mutation", name: "drop_all_tables", params: {} });
    const r = await parseIntent("verwijder alles");
    expect(r.kind).toBe("unknown");
  });

  it("returns unknown when the model says so", async () => {
    chatJson.mockResolvedValueOnce({ kind: "unknown", reason: "onduidelijk" });
    expect(await parseIntent("doe iets vaags")).toEqual({
      kind: "unknown",
      reason: "onduidelijk",
    });
  });
});

describe("runAdminConsole", () => {
  it("degrades gracefully when the LLM is offline", async () => {
    chatJson.mockRejectedValueOnce(AppError.upstream("LLM unreachable"));
    const r = await runAdminConsole({ question: "hoeveel gebruikers?", principal });
    expect(r.kind).toBe("clarification");
    if (r.kind === "clarification") expect(r.message).toMatch(/LLM|reasoning/i);
  });

  it("surfaces an unknown intent as a clarification", async () => {
    chatJson.mockResolvedValueOnce({ kind: "unknown", reason: "geen match" });
    const r = await runAdminConsole({ question: "?", principal });
    expect(r).toMatchObject({ kind: "clarification", message: "geen match" });
  });

  it("confirm executes once, then rejects a replay of the same token", async () => {
    const token = await mintConfirmToken({
      action: "block_freelancer_matching",
      params: { freelancerEmail: "x@y.nl", days: 7, reason: "onderzoek" },
      actorUserId: "usr_admin",
    });
    const first = await confirmAdminConsole({ confirmToken: token, principal });
    expect(first.kind).toBe("executed");

    redisSet.mockResolvedValueOnce(null); // NX fails -> already used
    await expect(
      confirmAdminConsole({ confirmToken: token, principal }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("confirm rejects a token minted for another operator", async () => {
    const token = await mintConfirmToken({
      action: "cancel_past_due_open_shifts",
      params: {},
      actorUserId: "someone_else",
    });
    await expect(
      confirmAdminConsole({ confirmToken: token, principal }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns an advisory + confirm token for a mutation intent and does NOT execute", async () => {
    chatJson.mockResolvedValueOnce({
      kind: "mutation",
      name: "block_freelancer_matching",
      params: { freelancerEmail: "x@y.nl", days: 7, reason: "fraude-onderzoek" },
    });
    const r = await runAdminConsole({
      question: "blokkeer x@y.nl voor 7 dagen wegens fraude-onderzoek",
      principal,
    });
    expect(r.kind).toBe("advisory");
    if (r.kind === "advisory") {
      expect(r.action).toBe("block_freelancer_matching");
      expect(r.confirmToken).toMatch(/^eyJ/); // a JWT
      expect(r.confirmEndpoint).toBe("/api/admin/console/confirm");
      const claim = await verifyConfirmToken(r.confirmToken);
      expect(claim.actorUserId).toBe("usr_admin");
    }
  });
});
