import { afterEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
const gatherSnapshot = vi.fn();
const runCreate = vi.fn();
const runUpdate = vi.fn();
const findingCreate = vi.fn();
const jarvisTurnCreate = vi.fn();
const jarvisEventCreate = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  chatJson: (...a: unknown[]) => chatJson(...a),
  chat: vi.fn(),
}));
vi.mock("@/lib/orchestration/snapshot", () => ({
  gatherSnapshot: (...a: unknown[]) => gatherSnapshot(...a),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    orchestrationRun: {
      create: (...a: unknown[]) => runCreate(...a),
      update: (...a: unknown[]) => runUpdate(...a),
    },
    orchestrationFinding: { create: (...a: unknown[]) => findingCreate(...a) },
    jarvisTurn: { create: (...a: unknown[]) => jarvisTurnCreate(...a) },
    jarvisEvent: { create: (...a: unknown[]) => jarvisEventCreate(...a) },
  },
}));

// Fire-and-forget logAgentActivity calls are not awaited by runOrchestrationCycle;
// give their microtasks a turn to flush before asserting on them.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

import { runOrchestrationCycle } from "@/lib/orchestration/core";
import { proposePatch } from "@/lib/orchestration/dev-advisor";

const SNAPSHOT = {
  takenAt: new Date().toISOString(),
  health: { database: true, cache: true, llm: true, webPush: true },
  queues: {
    openDisputes: 0,
    timesheetsAwaitingApproval: 0,
    staleOpenShifts: 0,
    failedPayments: 0,
    matchingBlockedFreelancers: 0,
  },
  audit24h: { warnings: 0, criticals: 0, samples: [] },
  dba: { high: 0, critical: 0 },
  sales: { newLeads: 0, draftsAwaitingApproval: 0 },
};

afterEach(() => vi.clearAllMocks());

describe("runOrchestrationCycle", () => {
  it("records findings and completes", async () => {
    gatherSnapshot.mockResolvedValue(SNAPSHOT);
    runCreate.mockResolvedValue({ id: "run_1" });
    runUpdate.mockResolvedValue({});
    findingCreate.mockResolvedValue({});
    chatJson.mockResolvedValue({
      summary: "Platform gezond.",
      findings: [
        {
          severity: "INFO",
          category: "health",
          title: "Alles operationeel",
          detail: "Geen actie nodig.",
          actionKind: "NONE",
          action: null,
        },
      ],
    });

    const result = await runOrchestrationCycle({ trigger: "MANUAL" });
    expect(result.status).toBe("COMPLETED");
    expect(result.findingsCount).toBe(1);
    expect(findingCreate).toHaveBeenCalledOnce();
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("marks the run FAILED when the model errors", async () => {
    gatherSnapshot.mockResolvedValue(SNAPSHOT);
    runCreate.mockResolvedValue({ id: "run_2" });
    runUpdate.mockResolvedValue({});
    chatJson.mockRejectedValue(new Error("LLM unreachable"));

    const result = await runOrchestrationCycle({ trigger: "CRON" });
    expect(result.status).toBe("FAILED");
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  // A cron-triggered cycle has no human-chat turn to attach progress events
  // to; this is the only thing that makes the Control Center's "Analyst"
  // tile show activity for autonomous cycles (see lib/orchestration/core.ts).
  it("logs a synthetic analyst JarvisEvent on a completed cycle", async () => {
    gatherSnapshot.mockResolvedValue(SNAPSHOT);
    runCreate.mockResolvedValue({ id: "run_3" });
    runUpdate.mockResolvedValue({});
    findingCreate.mockResolvedValue({});
    jarvisTurnCreate.mockResolvedValue({ id: "turn_1" });
    jarvisEventCreate.mockResolvedValue({});
    chatJson.mockResolvedValue({
      summary: "Platform gezond.",
      findings: [
        { severity: "INFO", category: "health", title: "Alles operationeel", detail: "", actionKind: "NONE", action: null },
      ],
    });

    await runOrchestrationCycle({ trigger: "CRON" });
    await flush();

    expect(jarvisTurnCreate).toHaveBeenCalledOnce();
    expect(jarvisEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agent: "analyst", turnId: "turn_1" }),
      }),
    );
    // No CODE_PATCH finding was proposed, so no "developer:tom" event either.
    expect(jarvisEventCreate).toHaveBeenCalledTimes(1);
  });

  it("logs a synthetic analyst JarvisEvent (not developer:tom) when the cycle fails", async () => {
    gatherSnapshot.mockResolvedValue(SNAPSHOT);
    runCreate.mockResolvedValue({ id: "run_4" });
    runUpdate.mockResolvedValue({});
    jarvisTurnCreate.mockResolvedValue({ id: "turn_2" });
    jarvisEventCreate.mockResolvedValue({});
    chatJson.mockRejectedValue(new Error("LLM unreachable"));

    await runOrchestrationCycle({ trigger: "CRON" });
    await flush();

    expect(jarvisEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agent: "analyst", turnId: "turn_2" }),
      }),
    );
    expect(jarvisEventCreate).toHaveBeenCalledTimes(1);
  });
});

describe("proposePatch path safety", () => {
  it("rejects path traversal", async () => {
    await expect(
      proposePatch({ description: "iets", files: ["../../etc/passwd"] }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects a disallowed file type", async () => {
    await expect(
      proposePatch({ description: "iets", files: ["lib/secret.env"] }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects an absolute path", async () => {
    await expect(
      proposePatch({ description: "iets", files: ["/etc/hosts"] }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
