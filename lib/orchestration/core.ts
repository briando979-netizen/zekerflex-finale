import { z } from "zod";
import {
  FindingActionKind,
  FindingSeverity,
  type OrchestrationTrigger,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { announce } from "@/lib/voice/announce";
import { chatJson } from "@/lib/ai/client";
import { QUERIES } from "@/lib/admin-console/queries";
import { MUTATIONS } from "@/lib/admin-console/mutations";
import { gatherSnapshot } from "@/lib/orchestration/snapshot";
import { proposePatch } from "@/lib/orchestration/dev-advisor";
import { retrieveContext } from "@/lib/rag/query";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// The "Jarvis loop": observe -> interpret (self-hosted LLM) -> record findings.
//
// It NEVER executes a mutation or applies code. Findings that suggest action
// carry only:
//   CONSOLE_QUERY    -> a read-only query name + params (auto-run, result attached)
//   CONSOLE_MUTATION -> a mutation name + params + dry-run impact (human confirms
//                       via the admin console)
//   CODE_PATCH       -> a proposed diff + rationale (human applies via git)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Je bent de operationele orchestrator van ZekerFlex, een self-hosted flex-arbeidsplatform.
Je krijgt een JSON-snapshot van de platformstatus. Analyseer het en geef bevindingen.

Antwoord UITSLUITEND met JSON:
{"summary": string (max 3 zinnen, NL),
 "findings": [
   {"severity":"INFO|LOW|MEDIUM|HIGH|CRITICAL",
    "category": string (kort, bv. "billing","disputes","health","sales","dba"),
    "title": string,
    "detail": string (NL, concreet),
    "actionKind":"NONE|CONSOLE_QUERY|CONSOLE_MUTATION|CODE_PATCH|MANUAL",
    "action": object | null }
 ]}

Regels:
- CONSOLE_QUERY: action = {"query": <naam>, "params": {}} uit de QUERY-catalogus.
- CONSOLE_MUTATION: action = {"mutation": <naam>, "params": {}} uit de MUTATIE-catalogus. Wordt NIET automatisch uitgevoerd.
- CODE_PATCH: action = {"description": string, "files": string[]} - alleen als er duidelijk een codebug is.
- Verzin geen namen buiten de catalogus. Max 8 bevindingen. Als alles gezond is: één INFO-bevinding.`;

const findingSchema = z.object({
  severity: z.nativeEnum(FindingSeverity).catch(FindingSeverity.INFO),
  category: z.string().max(40).default("general"),
  title: z.string().max(160),
  detail: z.string().max(2000).default(""),
  actionKind: z.nativeEnum(FindingActionKind).catch(FindingActionKind.NONE),
  action: z.record(z.unknown()).nullish(),
});

const responseSchema = z.object({
  summary: z.string().max(1000).default(""),
  findings: z.array(findingSchema).max(20).default([]),
});

function catalogue(): string {
  const q = Object.values(QUERIES)
    .map((h) => `- ${h.name}: ${h.description} params=${h.paramsHint}`)
    .join("\n");
  const m = Object.values(MUTATIONS)
    .map((h) => `- ${h.name}: ${h.description} params=${h.paramsHint}`)
    .join("\n");
  return `QUERY-catalogus:\n${q}\n\nMUTATIE-catalogus:\n${m}`;
}

const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

async function buildActionPayload(
  kind: FindingActionKind,
  action: Record<string, unknown> | null | undefined,
): Promise<Prisma.InputJsonValue> {
  if (!action) return {};
  try {
    if (kind === FindingActionKind.CONSOLE_QUERY) {
      const name = String(action.query ?? "");
      const handler = QUERIES[name];
      if (!handler) return { error: `onbekende query: ${name}` };
      const params = handler.params.safeParse(action.params ?? {});
      if (!params.success) return { query: name, error: "ongeldige params" };
      const result = await handler.run(params.data, {});
      return json({ query: name, params: params.data, result });
    }
    if (kind === FindingActionKind.CONSOLE_MUTATION) {
      const name = String(action.mutation ?? "");
      const handler = MUTATIONS[name];
      if (!handler) return { error: `onbekende mutatie: ${name}` };
      const params = handler.params.safeParse(action.params ?? {});
      if (!params.success) return { mutation: name, error: "ongeldige params" };
      const impact = await handler.dryRun(params.data, {});
      return json({
        mutation: name,
        params: params.data,
        impact,
        note: "Niet uitgevoerd. Bevestig via de admin-console.",
      });
    }
    if (kind === FindingActionKind.CODE_PATCH) {
      const description = String(action.description ?? "");
      const files = Array.isArray(action.files)
        ? action.files.map(String).slice(0, 6)
        : [];
      if (!description || files.length === 0) {
        return { error: "CODE_PATCH vereist description + files" };
      }
      return json(await proposePatch({ description, files }));
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  return {};
}

export interface RunCycleInput {
  trigger: OrchestrationTrigger;
  actorUserId?: string | null;
}

export interface RunCycleResult {
  runId: string;
  status: "COMPLETED" | "FAILED";
  summary: string;
  findingsCount: number;
}

export async function runOrchestrationCycle(
  input: RunCycleInput,
): Promise<RunCycleResult> {
  const snapshot = await gatherSnapshot();

  const run = await prisma.orchestrationRun.create({
    data: {
      trigger: input.trigger,
      model: "self-hosted-llm",
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    // Pull recurring-issue context from the local total memory (best effort).
    const memory = await retrieveContext(
      "terugkerende operationele problemen, incidenten, mislukte betalingen, geschillen, Wet DBA-risico",
      { limit: 6, sourceTypes: ["AUDIT", "INTERACTION", "LEGAL"] },
    );
    const memoryMsg = memory.context
      ? [
          {
            role: "system" as const,
            content: `RELEVANT UIT HET GEHEUGEN (historie):\n${memory.context.slice(0, 4000)}`,
          },
        ]
      : [];

    const parsed = responseSchema.parse(
      await chatJson<unknown>({
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${catalogue()}` },
          ...memoryMsg,
          { role: "user", content: JSON.stringify(snapshot) },
        ],
        temperature: 0.1,
        maxTokens: 1200,
      }),
    );

    for (const f of parsed.findings) {
      const payload = await buildActionPayload(f.actionKind, f.action);
      await prisma.orchestrationFinding.create({
        data: {
          runId: run.id,
          severity: f.severity,
          category: f.category,
          title: f.title,
          detail: f.detail,
          actionKind: f.actionKind,
          actionPayload: payload,
        },
      });
    }

    await prisma.orchestrationRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        summary: parsed.summary,
      },
    });

    await recordAudit({
      category: "ORCHESTRATION",
      action: "orchestration.cycle.completed",
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorUserId ? "user" : "system",
      summary: `Orchestratiecyclus afgerond: ${parsed.findings.length} bevinding(en)`,
      targetType: "orchestrationRun",
      targetId: run.id,
      metadata: { trigger: input.trigger, findings: parsed.findings.length },
    });

    const worst = parsed.findings.reduce(
      (acc, f) =>
        ["HIGH", "CRITICAL"].includes(f.severity) ? f.severity : acc,
      "",
    );
    void announce({
      text:
        parsed.summary ||
        `Orchestratiecyclus afgerond met ${parsed.findings.length} bevindingen.`,
      category: "orchestration",
      priority: worst ? "HIGH" : "NORMAL",
      source: "jarvis-core",
      rephrase: true,
    });

    return {
      runId: run.id,
      status: "COMPLETED",
      summary: parsed.summary,
      findingsCount: parsed.findings.length,
    };
  } catch (err) {
    const message = (err as Error).message;
    logger.error("orchestration cycle failed", { runId: run.id, error: message });
    await prisma.orchestrationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    await recordAudit({
      category: "ORCHESTRATION",
      action: "orchestration.cycle.failed",
      actorLabel: "system",
      severity: "warning",
      summary: `Orchestratiecyclus mislukt: ${message.slice(0, 160)}`,
      targetType: "orchestrationRun",
      targetId: run.id,
    });
    if (err instanceof AppError) throw err;
    return {
      runId: run.id,
      status: "FAILED",
      summary: `Cyclus mislukt: ${message}`,
      findingsCount: 0,
    };
  }
}

export interface FindingResolution {
  action: "acknowledge" | "dismiss" | "actioned";
  note?: string;
  resolvedById: string;
}

export async function resolveFinding(id: string, res: FindingResolution) {
  const finding = await prisma.orchestrationFinding.findUnique({ where: { id } });
  if (!finding) throw AppError.notFound("Finding not found");

  const statusMap = {
    acknowledge: "ACKNOWLEDGED",
    dismiss: "DISMISSED",
    actioned: "ACTIONED",
  } as const;

  const updated = await prisma.orchestrationFinding.update({
    where: { id },
    data: {
      status: statusMap[res.action],
      resolvedById: res.resolvedById,
      resolvedAt: new Date(),
      resolutionNote: res.note ?? null,
    },
  });
  await recordAudit({
    category: "ORCHESTRATION",
    action: `orchestration.finding.${res.action}`,
    actorUserId: res.resolvedById,
    actorLabel: "user",
    summary: `Bevinding "${finding.title}" -> ${statusMap[res.action]}`,
    targetType: "orchestrationFinding",
    targetId: id,
  });
  return updated;
}
