import type { ModelRole } from "@/lib/ai/models";
import { modelFor } from "@/lib/ai/models";

// ---------------------------------------------------------------------------
// Slim schakelen — kies per vraag het juiste modelniveau.
//
// Simpele vraag/begroeting → snel, klein model (goedkoop/snel, en bij lokaal
// €0). Moeilijke/redeneer-/code-/analysevraag → het grote hoofd- of
// redeneermodel. Zo zet je zware denkkracht alleen in als het nodig is, zonder
// handmatig te wisselen. Elke rol valt in lib/ai/models.ts terug op het
// hoofdmodel als er geen eigen model voor is ingesteld.
// ---------------------------------------------------------------------------

const SIMPLE =
  /^(hoi|hai|hallo|hey|yo|hi|dag|h[eé]|goeie?morgen|goedemorgen|goedemiddag|goedenavond|bedankt|dank(je| u| je wel)?|thanks|thx|oke|ok[eé]?|top|ja|nee|prima|doei|later|tot ziens)\b/i;
const CODE =
  /\b(code|codeer|functie|function|klasse|class|bug|stacktrace|typescript|javascript|python|\bsql\b|regex|\bapi\b|endpoint|script|compileer|refactor|migratie|prisma|deploy)\b/i;
const REASON =
  /\b(waarom|leg uit|verklaar|analyse|analyseer|vergelijk|strategie|plan(nen)?|bereken|reken\b|stap voor stap|afweging|voor- ?en ?nadelen|optimaliseer|prognose|voorspel|beargumenteer|hoe kan ik|wat is de beste|adviseer|beoordeel|ontwerp|bedenk een)\b/i;

/** Welk modelniveau past bij deze prompt. */
export function complexityRole(prompt: string): ModelRole {
  const p = prompt.trim();
  const words = p.split(/\s+/).filter(Boolean).length;
  if (words <= 3 || SIMPLE.test(p)) return "fast";
  if (CODE.test(p)) return "code";
  const questionMarks = (p.match(/\?/g) ?? []).length;
  if (REASON.test(p) || words > 40 || questionMarks >= 2) return "reasoning";
  return "main";
}

const ROLE_LABEL: Record<ModelRole, string> = {
  fast: "snel model",
  main: "hoofdmodel",
  reasoning: "redeneermodel",
  code: "codemodel",
  translate: "vertaalmodel",
  vision: "beeldmodel",
  embed: "embeddings",
};

/** Het gekozen model + een leesbaar label, voor de chat-/turn-paden. */
export function chatModelFor(prompt: string): { role: ModelRole; model: string; label: string } {
  const role = complexityRole(prompt);
  return { role, model: modelFor(role), label: ROLE_LABEL[role] };
}

/** Redeneermodellen (bv. deepseek-r1) zetten hun denkstappen tussen <think>…</think>;
 *  die horen niet in het chat-antwoord. Verwijder ze (ongevaarlijk als ze ontbreken). */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}
