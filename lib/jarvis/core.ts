import { quickIntent } from "@/lib/admin-console/parser";
import { z } from "zod";
import type { JarvisEventKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chat, chatJson, fastModel } from "@/lib/ai/client";
import { chatModelFor, stripReasoning } from "@/lib/ai/escalate";
import type { Principal } from "@/lib/auth";
import { askWithMemory } from "@/lib/rag/query";
import { runAdminConsole } from "@/lib/admin-console";
import { runOrchestrationCycle } from "@/lib/orchestration/core";
import { speakBriefing } from "@/lib/voice/briefing";
import {
  JARVIS_PERSONA,
  JARVIS_REPORT_RULES,
  JARVIS_ROUTER_PREFIX,
} from "@/lib/jarvis/persona";
import { jarvisStateLine } from "@/lib/admin/overview";
import { inspectPrompt } from "@/lib/security/prompt-guard";
import { bouwer, bouwerLlm, type TaakKort } from "@/lib/bouwer/werker";
import { agentLeeft, isBezig, leesLive, plaatsVerzoek } from "@/lib/bouwer/live";
import { bouwerStand } from "@/lib/bouwer/stand";
import { herstartTaak, onderhoudVanuitChat } from "@/lib/bouwer/onderhoud";

// ---------------------------------------------------------------------------
// Jarvis conversational core.
//
// One user message -> a routed turn. The router (local LLM) picks a sub-agent
// and a capability; the turn runs it and streams JarvisEvent rows (the chat
// UI's collapsible progress blocks). No cloud, no per-token cost - everything
// runs through the governed local model.
// ---------------------------------------------------------------------------

const AGENTS = {
  jarvis: "jarvis",
  analyst: "analyst",
  developer: "developer:tom",
  sales: "sales",
} as const;

const routeSchema = z.object({
  // "bouwer", "bouwerstatus", "live", "serverstand" en "onderhoud" komen alleen uit heuristicRoute, nooit uit de LLM-router
  capability: z.enum(["memory", "console", "orchestration", "briefing", "chat", "bouwer", "bouwerstatus", "live", "serverstand", "onderhoud"]),
  agent: z.enum(["jarvis", "analyst", "developer", "sales"]).default("jarvis"),
  rationale: z.string().max(300).default(""),
});
export type Route = z.infer<typeof routeSchema>;

const REPORT_SYSTEM = `${JARVIS_PERSONA}\n\n${JARVIS_REPORT_RULES}`;

async function structureAnswer(
  prompt: string,
  raw: string,
  toolNote: string,
): Promise<string> {
  if (raw.length < 40) return raw;
  try {
    const r = await chat({
      purpose: "jarvis-report",
      interactief: true,
      messages: [
        { role: "system", content: REPORT_SYSTEM },
        {
          role: "user",
          content: `Vraag: ${prompt}\n\nResultaat:\n${raw}\n\nUitgevoerde stappen:\n${toolNote}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 500,
    });
    const text = r.text.trim();
    return text.length > raw.length / 2 ? text : raw;
  } catch {
    return raw;
  }
}

const ROUTER_SYSTEM = `${JARVIS_ROUTER_PREFIX} Kies EEN capability voor het verzoek:
- "memory": vragen over de codebase, historie, Wet DBA, sales-historie, "wat weet je over ...".
- "console": platform-statistieken/acties opvragen ("hoeveel ...", "zoek ...", "blokkeer ...").
- "orchestration": "controleer het platform", "draai een analyse", "wat zijn de problemen".
- "briefing": "geef me een update", "vertel me de status", "briefing".
- "chat": algemene uitleg, begroeting of gesprek. BIJ TWIJFEL: kies "chat".
Kies ook de sub-agent: "analyst" (data/analyse), "developer" (code/bugs), "sales" (leads/outreach), "jarvis" (overig).
Antwoord met JSON: {"capability": ..., "agent": ..., "rationale": "<kort, NL>"}.`;

// "bouw: …", "bouwer: …", "bouwer, …" of "laat de bouwer …"
const BOUWER_OPDRACHT = /^(bouw(er)?\s*:|bouwer,|laat de bouwer\b)/;

// Deterministic routing. The local router model is weak; match obvious intents
// first and only fall back to the LLM for genuinely ambiguous prompts.
export function heuristicRoute(prompt: string): Route | null {
  const p = prompt.trim().toLowerCase();
  const words = p.split(/\s+/).filter(Boolean);

  // De Bouwer (AI-programmeur) en de live-zetter: alleen op een expliciete opdracht,
  // zodat een gewone vraag nooit per ongeluk code wijzigt of uitrolt.
  if (BOUWER_OPDRACHT.test(p) && words.length >= 3) {
    return { capability: "bouwer", agent: "developer", rationale: "opdracht voor de Bouwer" };
  }
  if (/^(zet (alles |het |de nieuwste versie |nieuwste versie )?live|rol (alles |het |de nieuwste versie )?uit)\b/.test(p)) {
    return { capability: "live", agent: "developer", rationale: "nieuwste versie live zetten" };
  }
  // alleen lezen: wat doet de Bouwer, wat staat er live
  if (/\b(bouwer|live-?zetter|uitrol)\b/.test(p) && /^(hoe staat|hoe gaat|wat doet|status|stand van|staat er|is de bouwer|wat staat er live)/.test(p)) {
    return { capability: "bouwerstatus", agent: "developer", rationale: "stand van de Bouwer en de uitrol" };
  }
  // serveronderhoud (lib/bouwer/onderhoud.ts): de stand lezen, of één onderdeel herstarten
  if (/^(serverstand|stand van de server|status van de server|hoe staat (het met )?de server|hoe gaat het met de server)\b/.test(p)) {
    return { capability: "serverstand", agent: "developer", rationale: "stand van de server (alleen lezen)" };
  }
  if (herstartTaak(p)) {
    return { capability: "onderhoud", agent: "developer", rationale: "één onderdeel van de server herstarten" };
  }

  // Greetings / smalltalk / very short -> conversation.
  if (
    /^(hoi|hai|hallo|hey|yo|goedemorgen|goedemiddag|goedenavond|hi|dag|hé|he)\b/.test(p) ||
    /\b(hoe gaat het|alles goed|wie ben je|wat kun je|dank je|dankje|bedankt|thanks|top|oke|oké|ok)\b/.test(p) ||
    words.length <= 2
  ) {
    return { capability: "chat", agent: "jarvis", rationale: "gesprek/begroeting" };
  }
  if (/\b(briefing|geef.*update|status(rapport)?|hoe staat|hoe gaat het platform)\b/.test(p)) {
    return { capability: "briefing", agent: "jarvis", rationale: "statusbriefing" };
  }
  if (/\b(controleer|analyseer|scan|draai.*(analyse|cyclus)|welke problemen|wat is er mis|orchestrat)\b/.test(p)) {
    return { capability: "orchestration", agent: "analyst", rationale: "platformanalyse" };
  }
  if (/^(hoeveel|hoe veel|toon|lijst|geef.*lijst|zoek|blokkeer|deactiveer|annuleer|welke)\b/.test(p)) {
    return { capability: "console", agent: "analyst", rationale: "console-query" };
  }
  if (/\b(wat weet je|codebase|hoe werkt|documentatie|wet dba|kennisbank|architectuur|leg uit hoe)\b/.test(p)) {
    return { capability: "memory", agent: "jarvis", rationale: "kennisvraag" };
  }
  return null;
}

async function emit(
  turnId: string,
  kind: JarvisEventKind,
  agent: string,
  title: string,
  opts: { detail?: string; payload?: unknown; durationMs?: number } = {},
): Promise<void> {
  try {
    const last = await prisma.jarvisEvent.findFirst({
      where: { turnId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    await prisma.jarvisEvent.create({
      data: {
        turnId,
        seq: (last?.seq ?? 0) + 1,
        kind,
        agent,
        title: title.slice(0, 200),
        detail: opts.detail?.slice(0, 4000) ?? null,
        payload: JSON.parse(JSON.stringify(opts.payload ?? {})),
        durationMs: opts.durationMs ?? null,
      },
    });
  } catch (err) {
    logger.warn("jarvis emit failed", { turnId, error: (err as Error).message });
  }
}

export interface StartTurnInput {
  prompt: string;
  principal: Principal;
  uploadIds?: string[];
}

/** Last few completed exchanges for this user, as chat messages, so Jarvis
 *  can actually hold a conversation ("zeg hallo terug", follow-up questions). */
async function recentDialogue(
  userId: string,
  excludeTurnId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const turns = await prisma.jarvisTurn.findMany({
    where: { userId, status: "COMPLETED", id: { not: excludeTurnId }, answer: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 4,
    select: { prompt: true, answer: true },
  });
  return turns
    .reverse()
    .flatMap((t) => [
      { role: "user" as const, content: t.prompt.slice(0, 800) },
      { role: "assistant" as const, content: (t.answer ?? "").slice(0, 1200) },
    ]);
}

export async function startTurn(input: StartTurnInput): Promise<{ turnId: string }> {
  const guard = inspectPrompt(input.prompt);
  if (!guard.allowed) {
    throw AppError.validation("Deze instructie valt buiten de veiligheidsgrenzen van Jarvis.");
  }
  const turn = await prisma.jarvisTurn.create({
    data: { userId: input.principal.userId, prompt: input.prompt.slice(0, 4000) },
  });

  if (input.uploadIds && input.uploadIds.length > 0) {
    await prisma.upload
      .updateMany({
        where: { id: { in: input.uploadIds }, jarvisTurnId: null },
        data: { jarvisTurnId: turn.id },
      })
      .catch(() => undefined);
  }

  void runTurn(turn.id, input).catch((err) => {
    logger.error("jarvis turn crashed", { turnId: turn.id, error: (err as Error).message });
  });

  return { turnId: turn.id };
}

async function runTurn(turnId: string, input: StartTurnInput): Promise<void> {
  const started = Date.now();
  try {
    const t0 = Date.now();
    await emit(turnId, "THINKING", AGENTS.jarvis, "Verzoek analyseren");

    let route: Route | null = heuristicRoute(input.prompt);
    if (!route) {
      try {
        route = routeSchema.parse(
          await chatJson<unknown>({
            purpose: "jarvis-router",
            model: fastModel(),
            messages: [
              { role: "system", content: ROUTER_SYSTEM },
              { role: "user", content: input.prompt },
            ],
            temperature: 0,
            maxTokens: 150,
          }),
        );
      } catch {
        route = { capability: "chat", agent: "jarvis", rationale: "router-fallback" };
      }
      // code wijzigen of uitrollen nooit op gok van het model
      if (["bouwer", "bouwerstatus", "live", "serverstand", "onderhoud"].includes(route.capability)) {
        route = { capability: "chat", agent: "jarvis", rationale: "router-fallback" };
      }
    }
    const agent = AGENTS[route.agent];
    await emit(turnId, "THINKING", AGENTS.jarvis, `Gekozen: ${route.capability}`, {
      detail: route.rationale,
      durationMs: Date.now() - t0,
    });

    if (route.agent !== "jarvis") {
      await emit(
        turnId,
        "AGENT_DELEGATION",
        AGENTS.jarvis,
        `Jarvis → ${agent}`,
        { detail: `Taak overgedragen aan ${agent} (${route.capability}).` },
      );
    }

    let answer = "";
    const stepStart = Date.now();

    if (route.capability === "memory") {
      await emit(turnId, "TOOL_CALL", agent, "RAG: geheugen doorzoeken", {
        payload: { question: input.prompt },
      });
      const res = await askWithMemory(input.prompt);
      answer = res.answer;
      await emit(turnId, "TOOL_RESULT", agent, `${res.sources.length} bronnen`, {
        detail: res.sources.map((s) => `${s.sourceType} · ${s.sourceRef}`).join("\n"),
        payload: { sources: res.sources },
        durationMs: Date.now() - stepStart,
      });
    } else if (route.capability === "console") {
      await emit(turnId, "TOOL_CALL", agent, "Admin-console", {
        payload: { question: input.prompt },
      });
      const res = await runAdminConsole({ question: input.prompt, principal: input.principal });
      await emit(turnId, "TOOL_RESULT", agent, `Console: ${res.kind}`, {
        payload: res as unknown,
        durationMs: Date.now() - stepStart,
      });
      answer =
        res.kind === "answer"
          ? (res.summary ?? "Zie het resultaat hieronder.")
          : res.kind === "advisory"
            ? `${res.message} (impact: ${res.impact.affectedCount} records)`
            : res.message;
    } else if (route.capability === "orchestration") {
      await emit(turnId, "TOOL_CALL", agent, "Orchestratiecyclus starten");
      const res = await runOrchestrationCycle({
        trigger: "MANUAL",
        actorUserId: input.principal.userId,
      });
      await emit(turnId, "TOOL_RESULT", agent, `${res.findingsCount} bevindingen`, {
        payload: res as unknown,
        durationMs: Date.now() - stepStart,
      });
      answer = res.summary || `Cyclus afgerond met ${res.findingsCount} bevindingen.`;
    } else if (route.capability === "bouwer") {
      const opdracht = input.prompt.trim().replace(/^(bouw(er)?\s*:|bouwer,|laat de bouwer)\s*/i, "");
      await emit(turnId, "TOOL_CALL", agent, "Opdracht naar de Bouwer", { payload: { opdracht } });
      try {
        const llm = await bouwerLlm();
        const taak = await bouwer<TaakKort>("/taken", { method: "POST", body: { opdracht, door: input.principal.email, llm } });
        await recordAudit({
          category: "ADMIN",
          action: "admin.bouwer.opdracht",
          severity: "info",
          actorUserId: input.principal.userId,
          actorLabel: "user",
          summary: `${input.principal.email} gaf de Bouwer via ZekerFlex AI een opdracht (${llm.model}): ${opdracht.slice(0, 200)}`,
        });
        answer = `De Bouwer is begonnen (${taak.model}). Volg hem live in het tabblad Bouwer; daar zie je precies wat er verandert en keur je het goed, stuur je bij of gooi je het weg.`;
      } catch (err) {
        answer = `De Bouwer kon niet starten: ${(err as Error).message}`;
      }
      await emit(turnId, "TOOL_RESULT", agent, "Bouwer", { detail: answer, durationMs: Date.now() - stepStart });
    } else if (route.capability === "bouwerstatus") {
      await emit(turnId, "TOOL_CALL", agent, "Stand van de Bouwer en de uitrol");
      answer = await bouwerStand();
      await emit(turnId, "TOOL_RESULT", agent, "Stand", { detail: answer, durationMs: Date.now() - stepStart });
    } else if (route.capability === "live") {
      await emit(turnId, "TOOL_CALL", agent, "Live zetten aanvragen");
      const stand = await leesLive();
      if (stand.verzoek || isBezig(stand.status)) {
        answer = "Er loopt al een uitrol. Volg hem in het tabblad Live zetten.";
      } else if (!agentLeeft(stand.hartslag)) {
        answer = "De live-zetter op de server reageert niet; ik kan nu niet uitrollen. Kijk in het tabblad Live zetten.";
      } else {
        await plaatsVerzoek({ actie: "uitrollen", migraties: [], destructiefAkkoord: false, forceer: false, door: input.principal.email });
        await recordAudit({
          category: "ADMIN",
          action: "admin.live.uitrollen",
          severity: "info",
          actorUserId: input.principal.userId,
          actorLabel: "user",
          summary: `${input.principal.email} zette via ZekerFlex AI de nieuwste versie live`,
        });
        answer =
          "Ik zet de nieuwste versie van GitHub live. Database-wijzigingen krijg je eerst te zien in het tabblad Live zetten, en als de nieuwe versie niet gezond start, zet de server zelf de vorige terug.";
      }
      await emit(turnId, "TOOL_RESULT", agent, "Live zetten", { detail: answer, durationMs: Date.now() - stepStart });
    } else if (route.capability === "serverstand" || route.capability === "onderhoud") {
      const taak = route.capability === "serverstand" ? "status" : herstartTaak(input.prompt);
      await emit(turnId, "TOOL_CALL", agent, taak === "status" ? "Serverstand ophalen" : "Onderdeel van de server herstarten");
      if (!taak) {
        answer = "Welk onderdeel? Ik kan de app, de Bouwer, de webserver of de planner herstarten.";
      } else {
        answer = await onderhoudVanuitChat(taak, input.principal.email);
        if (taak !== "status") {
          await recordAudit({
            category: "ADMIN",
            action: "admin.live.onderhoud",
            severity: "warning",
            actorUserId: input.principal.userId,
            actorLabel: "user",
            summary: `${input.principal.email} liet via ZekerFlex AI ${taak} uitvoeren (serveronderhoud)`,
          });
        }
      }
      await emit(turnId, "TOOL_RESULT", agent, "Serveronderhoud", { detail: answer, durationMs: Date.now() - stepStart });
    } else if (route.capability === "briefing") {
      await emit(turnId, "TOOL_CALL", agent, "Live briefing samenstellen");
      const res = await speakBriefing({ rephrase: true });
      answer = res.text;
      await emit(turnId, "TOOL_RESULT", agent, "Briefing uitgesproken", {
        durationMs: Date.now() - stepStart,
      });
    } else {
      // Slim schakelen: eenvoudige chat → snel model; moeilijke/redeneer-/code-
      // vraag → het grote model. Zichtbaar als stap in de console.
      const picked = chatModelFor(input.prompt);
      await emit(turnId, "THINKING", AGENTS.jarvis, `Slim geschakeld → ${picked.label}`, {
        detail: picked.model,
      });
      const [stateLine, history] = await Promise.all([
        jarvisStateLine().catch(() => ""),
        recentDialogue(input.principal.userId, turnId),
      ]);
      const res = await chat({
        purpose: "jarvis-chat",
        interactief: true,
        model: picked.model,
        messages: [
          { role: "system", content: JARVIS_PERSONA },
          ...(stateLine ? [{ role: "system" as const, content: `LIVE PLATFORMSTATUS: ${stateLine}` }] : []),
          ...history,
          { role: "user", content: input.prompt },
        ],
        temperature: 0.5,
        maxTokens: picked.role === "reasoning" || picked.role === "code" ? 900 : 500,
      });
      answer = stripReasoning(res.text);
    }

    const toolNote = (
      await prisma.jarvisEvent.findMany({
        where: { turnId, kind: { in: ["TOOL_CALL", "TOOL_RESULT", "AGENT_DELEGATION"] } },
        orderBy: { seq: "asc" },
        select: { title: true },
      })
    )
      .map((e) => `- ${e.title}`)
      .join("\n");

    // The chat + briefing paths already produce a finished conversational reply;
    // only the tool paths (memory/console/orchestration) get the structuring pass.
    const skipStructure =
      route.capability === "briefing" ||
      route.capability === "chat" ||
      route.capability === "bouwer" ||
      route.capability === "bouwerstatus" ||
      route.capability === "live" ||
      route.capability === "serverstand" ||
      route.capability === "onderhoud" ||
      answer.length < 40 ||
      // quick console questions already have a finished, model-free answer
      (route.capability === "console" && quickIntent(input.prompt) !== null);
    const report = skipStructure
      ? answer
      : await structureAnswer(input.prompt, answer, toolNote);

    await emit(turnId, "MESSAGE", agent, "Antwoord", { detail: report });
    await prisma.jarvisTurn.update({
      where: { id: turnId },
      data: { status: "COMPLETED", answer: report, endedAt: new Date() },
    });
    await recordAudit({
      category: "ORCHESTRATION",
      action: "jarvis.turn.completed",
      actorUserId: input.principal.userId,
      actorLabel: "user",
      summary: `Jarvis-turn (${route.capability}/${agent}): "${input.prompt.slice(0, 100)}"`,
      targetType: "jarvisTurn",
      targetId: turnId,
      metadata: { capability: route.capability, agent, ms: Date.now() - started },
    });
  } catch (err) {
    const message = (err as Error).message;
    await emit(turnId, "ERROR", AGENTS.jarvis, "Fout", { detail: message });
    await prisma.jarvisTurn
      .update({
        where: { id: turnId },
        data: { status: "FAILED", error: message, endedAt: new Date() },
      })
      .catch(() => undefined);
  }
}

const STUCK_MS = 5 * 60 * 1000;

export async function getTurn(turnId: string, sinceSeq = 0) {
  const turn = await prisma.jarvisTurn.findUnique({
    where: { id: turnId },
    include: {
      events: { where: { seq: { gt: sinceSeq } }, orderBy: { seq: "asc" } },
      uploads: { select: { id: true, filename: true, mimeType: true, sizeBytes: true } },
    },
  });
  if (!turn) return null;

  // Self-heal a turn abandoned by a process restart.
  if (turn.status === "RUNNING" && Date.now() - turn.startedAt.getTime() > STUCK_MS) {
    await prisma.jarvisTurn.update({
      where: { id: turnId },
      data: { status: "FAILED", error: "Turn afgebroken (proces herstart)", endedAt: new Date() },
    });
    turn.status = "FAILED";
  }
  return turn;
}

export async function listRecentTurns(userId: string, limit = 20) {
  return prisma.jarvisTurn.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, prompt: true, status: true, answer: true, startedAt: true, endedAt: true },
  });
}
