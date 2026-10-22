import { chatJson, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { tokenize } from "@/lib/rag/lexical";
import { reciprocalRankFusion } from "@/lib/rag/fusion";
import { advancedRecall, expandQuery, type AdvancedHit, type AdvancedTrace } from "@/lib/rag/advanced";
import type { RecallOptions } from "@/lib/rag/recall";

// ---------------------------------------------------------------------------
// Agentic RAG — retrieval as a small loop the brain steers itself:
//
//   plan     split a compound question into sub-questions        rules + model
//   act      advanced recall per sub-question
//   check    is what came back enough to answer it?              rules + model
//   retry    reformulate the query that came back thin, search   rules + model
//            again (max MAX_STEPS rounds)
//   merge    RRF over all sub-question results
//
// Every step is recorded in `steps` so admin can see why the brain answered
// what it answered (Admin → Systeem → RAG-lab).
// ---------------------------------------------------------------------------

export const MAX_STEPS = 3;

export interface AgentStep {
  step: number;
  action: "plan" | "zoek" | "controleer" | "herformuleer";
  detail: string;
}

export interface AgenticRecall {
  hits: AdvancedHit[];
  confident: boolean;
  subQuestions: string[];
  steps: AgentStep[];
  traces: AdvancedTrace[];
}

/** Rule planner: "hoe vul ik uren in en wanneer krijg ik betaald" → two questions. */
export function splitQuestion(q: string): string[] {
  const parts = q
    .split(/\?\s+|\s+(?:en|én|plus|daarnaast|ook)\s+(?=(?:hoe|wat|wanneer|waar|waarom|wie|kan|mag|moet|is|zijn|heb|krijg)\b)/i)
    .map((s) => s.trim().replace(/\?$/, ""))
    .filter((s) => tokenize(s).length >= 2);
  return parts.length > 1 ? parts.slice(0, 3) : [q.trim()];
}

async function modelPlan(q: string): Promise<string[] | null> {
  if (llmConfigProblem()) return null;
  try {
    const out = await chatJson<{ questions?: string[] }>({
      purpose: "rag-plan",
      model: fastModel(),
      temperature: 0,
      maxTokens: 150,
      retry: false,
      timeoutMs: 8_000,
      messages: [
        { role: "system", content: 'Splits de vraag in 1 tot 3 losse deelvragen die elk apart in een kennisbank op te zoeken zijn. Een enkelvoudige vraag blijft 1 vraag. JSON: {"questions": [...]}' },
        { role: "user", content: q.slice(0, 600) },
      ],
    });
    const qs = (out.questions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return qs.length ? qs : null;
  } catch {
    return null;
  }
}

async function modelJudge(q: string, hits: AdvancedHit[]): Promise<{ enough: boolean; better?: string } | null> {
  if (llmConfigProblem() || !hits.length) return null;
  try {
    return await chatJson<{ enough: boolean; better?: string }>({
      purpose: "rag-judge",
      model: fastModel(),
      temperature: 0,
      maxTokens: 80,
      retry: false,
      timeoutMs: 8_000,
      messages: [
        { role: "system", content: 'Beoordeel of de fragmenten genoeg informatie bevatten om de vraag te beantwoorden. JSON: {"enough": true|false, "better": "betere zoekvraag als het niet genoeg is"}' },
        { role: "user", content: `VRAAG: ${q}\n\n${hits.slice(0, 4).map((h, i) => `[${i + 1}] ${h.title}: ${h.excerpt.slice(0, 250)}`).join("\n")}` },
      ],
    });
  } catch {
    return null;
  }
}

/** Rule reformulation: keep the most informative words + domain synonyms. */
export function reformulate(q: string): string {
  const words = tokenize(q).filter((w) => w.length > 3);
  const core = words.slice(0, 5).join(" ");
  return expandQuery(core)[0] ?? core;
}

export async function agenticRecall(
  question: string,
  opts: RecallOptions & { history?: { role: string; content: string }[] },
): Promise<AgenticRecall> {
  const steps: AgentStep[] = [];
  const traces: AdvancedTrace[] = [];
  let n = 0;

  const planned = (await modelPlan(question)) ?? splitQuestion(question);
  steps.push({ step: ++n, action: "plan", detail: planned.length > 1 ? `${planned.length} deelvragen: ${planned.join(" | ")}` : "enkelvoudige vraag" });

  const perSub: { q: string; hits: AdvancedHit[]; confident: boolean }[] = [];
  for (const sub of planned) {
    let query = sub;
    let res = await advancedRecall(query, opts);
    traces.push(res.trace);
    steps.push({ step: ++n, action: "zoek", detail: `"${query}" → ${res.hits[0]?.title ?? "niets"}` });
    for (let round = 1; round < MAX_STEPS; round++) {
      const judge = await modelJudge(sub, res.hits);
      const enough = judge ? judge.enough : res.confident;
      steps.push({ step: ++n, action: "controleer", detail: enough ? "genoeg om te antwoorden" : "te weinig — opnieuw zoeken" });
      if (enough) break;
      const next = judge?.better?.trim() || reformulate(query);
      if (!next || next === query) break;
      query = next;
      steps.push({ step: ++n, action: "herformuleer", detail: `"${query}"` });
      const retry = await advancedRecall(query, { ...opts, history: [] });
      traces.push(retry.trace);
      // keep the better of the two rounds
      if ((retry.hits[0]?.rerank ?? 0) > (res.hits[0]?.rerank ?? 0)) res = retry;
      steps.push({ step: ++n, action: "zoek", detail: `"${query}" → ${retry.hits[0]?.title ?? "niets"}` });
    }
    perSub.push({ q: sub, hits: res.hits, confident: res.confident });
  }

  const k = opts.k ?? 5;
  const merged =
    perSub.length === 1
      ? perSub[0]!.hits
      : reciprocalRankFusion(perSub.map((s) => ({ name: s.q, items: s.hits })), (h) => h.id)
          .map((f) => f.item)
          .slice(0, k);

  return {
    hits: merged.slice(0, k),
    confident: perSub.every((s) => s.confident),
    subQuestions: planned,
    steps,
    traces,
  };
}
