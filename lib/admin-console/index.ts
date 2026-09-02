import { chat } from "@/lib/ai/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { announce } from "@/lib/voice/announce";
import type { Principal } from "@/lib/auth";
import { QUERIES } from "@/lib/admin-console/queries";
import { MUTATIONS } from "@/lib/admin-console/mutations";
import { parseIntent } from "@/lib/admin-console/parser";
import {
  claimConfirmToken,
  mintConfirmToken,
  verifyConfirmToken,
} from "@/lib/admin-console/advisory";
import type {
  ConfirmResponse,
  ConsoleContext,
  ConsoleResponse,
  QueryHandler,
  QueryResult,
} from "@/lib/admin-console/types";


export { buildCatalog } from "@/lib/admin-console/parser";
export type { ConsoleResponse, ConfirmResponse } from "@/lib/admin-console/types";

const CONFIRM_ENDPOINT = "/api/admin/console/confirm";
const LLM_OFFLINE_MESSAGE =
  "De reasoning-laag (self-hosted LLM) is niet bereikbaar. Start het model in de box (bijv. `ollama serve` + `ollama pull llama3.1:8b`) of stel LLM_BASE_URL in.";

async function summarise(
  question: string,
  handler: QueryHandler,
  result: QueryResult,
): Promise<string | null> {
  try {
    const r = await chat({
      messages: [
        {
          role: "system",
          content:
            "Vat het queryresultaat samen in 1-3 bondige Nederlandse zinnen voor een platformbeheerder. " +
            "Gebruik alleen de gegeven data, geen opmaak, geen aannames.",
        },
        {
          role: "user",
          content: `Vraag: ${question}\nQuery: ${handler.name}\nData (JSON):\n${JSON.stringify(
            { scalar: result.scalar ?? null, note: result.note ?? null, rows: result.rows.slice(0, 50) },
          )}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 220,
    });
    return r.text.trim() || null;
  } catch (err) {
    logger.warn("console summary skipped", { error: (err as Error).message });
    return null;
  }
}

export interface RunAdminConsoleInput {
  question: string;
  principal: Principal;
}

export async function runAdminConsole(
  input: RunAdminConsoleInput,
): Promise<ConsoleResponse> {
  const ctx: ConsoleContext = { principal: input.principal };
  const question = input.question.trim();

  let intent;
  try {
    intent = await parseIntent(question);
  } catch (err) {
    logger.warn("admin console parse failed", { error: (err as Error).message });
    await recordAudit({
      category: "ADMIN",
      action: "admin.console.ask",
      actorUserId: input.principal.userId,
      actorLabel: "user",
      summary: `Console-vraag kon niet worden geparsed (LLM offline): "${question.slice(0, 120)}"`,
      metadata: { intent: "llm_unavailable" },
    });
    return { kind: "clarification", message: LLM_OFFLINE_MESSAGE };
  }

  await recordAudit({
    category: "ADMIN",
    action: "admin.console.ask",
    actorUserId: input.principal.userId,
    actorLabel: "user",
    summary: `Console-vraag: "${question.slice(0, 140)}"`,
    metadata: {
      intent: intent.kind,
      name: intent.kind === "unknown" ? null : intent.name,
    },
  });

  if (intent.kind === "unknown") {
    return { kind: "clarification", message: intent.reason };
  }

  if (intent.kind === "query") {
    const handler = QUERIES[intent.name];
    if (!handler) {
      return { kind: "clarification", message: `Onbekende query: ${intent.name}` };
    }
    const parsed = handler.params.safeParse(intent.params);
    if (!parsed.success) {
      return {
        kind: "clarification",
        message: `Parameters voor "${intent.name}" onduidelijk. Verwacht: ${handler.paramsHint}`,
      };
    }
    const result = await handler.run(parsed.data, ctx);
    const summary = await summarise(question, handler, result);
    return {
      kind: "answer",
      query: intent.name,
      params: parsed.data as Record<string, unknown>,
      result,
      summary,
    };
  }

  // --- mutation: analyse only, never execute here ---
  const handler = MUTATIONS[intent.name];
  if (!handler) {
    return { kind: "clarification", message: `Onbekende actie: ${intent.name}` };
  }
  const parsed = handler.params.safeParse(intent.params);
  if (!parsed.success) {
    return {
      kind: "clarification",
      message: `Parameters voor "${intent.name}" onvolledig. Verwacht: ${handler.paramsHint}`,
    };
  }

  const impact = await handler.dryRun(parsed.data, ctx);
  const confirmToken = await mintConfirmToken({
    action: intent.name,
    params: parsed.data as Record<string, unknown>,
    actorUserId: input.principal.userId,
  });

  await recordAudit({
    category: "ADMIN",
    action: "admin.console.advisory",
    actorUserId: input.principal.userId,
    actorLabel: "user",
    severity: handler.risk === "high" ? "warning" : "info",
    summary: `Advisory: ${intent.name} zou ${impact.affectedCount} record(s) wijzigen`,
    targetType: "admin-console.mutation",
    targetId: intent.name,
    metadata: {
      params: parsed.data as Record<string, unknown>,
      affectedCount: impact.affectedCount,
      risk: handler.risk,
    },
  });

  return {
    kind: "advisory",
    action: intent.name,
    params: parsed.data as Record<string, unknown>,
    risk: handler.risk,
    impact,
    confirmToken,
    confirmEndpoint: CONFIRM_ENDPOINT,
    message:
      `Deze opdracht wijzigt ${impact.affectedCount} record(s) en wordt NIET ` +
      `automatisch uitgevoerd. Controleer de impact en bevestig via ${CONFIRM_ENDPOINT}.`,
  };
}

export interface ConfirmAdminConsoleInput {
  confirmToken: string;
  principal: Principal;
}

export async function confirmAdminConsole(
  input: ConfirmAdminConsoleInput,
): Promise<ConfirmResponse> {
  const claim = await verifyConfirmToken(input.confirmToken);
  if (claim.actorUserId !== input.principal.userId) {
    throw AppError.forbidden("Deze bevestigingstoken hoort bij een andere beheerder");
  }

  const handler = MUTATIONS[claim.action];
  if (!handler) throw AppError.notFound(`Onbekende actie: ${claim.action}`);

  // Single use: a confirm token executes at most once.
  if (!(await claimConfirmToken(claim.jti))) {
    throw AppError.conflict("Deze bevestiging is al gebruikt of verlopen");
  }

  const parsed = handler.params.safeParse(claim.params);
  if (!parsed.success) {
    throw AppError.validation("Bevestigingstoken bevat ongeldige parameters");
  }

  const ctx: ConsoleContext = { principal: input.principal };
  const preImpact = await handler.dryRun(parsed.data, ctx);
  const result = await handler.execute(parsed.data, ctx);

  await recordAudit({
    category: "ADMIN",
    action: "admin.console.mutation.executed",
    actorUserId: input.principal.userId,
    actorLabel: "user",
    severity: "critical",
    summary: `Mutatie ${claim.action} uitgevoerd: ${result.affectedCount} record(s) - ${result.detail}`,
    targetType: "admin-console.mutation",
    targetId: claim.action,
    metadata: {
      params: parsed.data as Record<string, unknown>,
      predictedCount: preImpact.affectedCount,
      affectedCount: result.affectedCount,
    },
  });

  logger.info("admin console mutation executed", {
    action: claim.action,
    affectedCount: result.affectedCount,
    actorUserId: input.principal.userId,
  });

  void announce({
    text: `Admin-console: ${claim.action} uitgevoerd. ${result.detail}`,
    category: "status",
    priority: "HIGH",
    source: "admin-console",
    rephrase: true,
  });

  return { kind: "executed", action: claim.action, result };
}
