import { chatJson, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { tokenize } from "@/lib/rag/lexical";
import { sentences } from "@/lib/rag/smart-chunk";
import { reciprocalRankFusion } from "@/lib/rag/fusion";
import { rerank } from "@/lib/rag/rerank";
import { brainVectorIndex, recall, type RecallHit, type RecallOptions, type Retriever } from "@/lib/rag/recall";

// ---------------------------------------------------------------------------
// Advanced RAG — the full retrieval pipeline on top of hybrid recall:
//
//   query ─► rewrite (follow-up → standalone)        rules + model
//         ─► expand (domain synonyms)                rules
//         ─► multi-query (+ model paraphrases)       model when connected
//         ─► HyDE (hypothetical answer as a query)   model when connected
//         ─► hybrid recall per query (BM25 + brein-vector + embeddings, RRF)
//         ─► RRF across all queries
//         ─► rerank (cross-score + model listwise + MMR)
//         ─► contextual compression (only the sentences that matter)
//
// Without a model every model step is skipped and the rest still runs.
// ---------------------------------------------------------------------------

/** ZekerFlex vocabulary: the words people use for the same thing. */
const SYNONYMS: string[][] = [
  ["klus", "dienst", "shift", "opdracht", "werk"],
  ["opdrachtgever", "werkgever", "bedrijf", "klant"],
  ["werknemer", "flexwerker", "freelancer", "zzp'er", "uitzendkracht"],
  ["uitbetaling", "betaling", "loon", "salaris", "geld", "uitbetaald"],
  ["uren", "urenbriefje", "timesheet", "werktijd"],
  ["verificatie", "verifiëren", "kyc", "identiteit", "id-check"],
  ["iban", "bankrekening", "rekeningnummer"],
  ["afzeggen", "annuleren", "niet komen", "vervanger"],
  ["kosten", "prijs", "tarief", "fee", "platformkosten"],
  ["kvk", "kamer van koophandel", "inschrijving"],
  ["dba", "schijnzelfstandigheid", "modelovereenkomst"],
  ["inloggen", "aanmelden", "account"],
];

export function expandQuery(q: string): string[] {
  const lower = q.toLowerCase();
  const extra: string[] = [];
  for (const group of SYNONYMS) {
    const hit = group.find((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\']/g, "\\$&")}`, "i").test(lower));
    if (hit) extra.push(...group.filter((w) => w !== hit).slice(0, 3));
  }
  return extra.length ? [`${q} ${extra.join(" ")}`] : [];
}

/** Rule rewrite of a short follow-up ("en morgen?") into a standalone query. */
export function standalone(q: string, history: { role: string; content: string }[]): string {
  const prev = [...history].reverse().find((t) => t.role === "user")?.content;
  if (!prev) return q;
  const short = tokenize(q).length <= 3 || /^(en|maar|ook|wat als|hoe zit|en als|waarom)\b/i.test(q.trim());
  return short ? `${prev} ${q}` : q;
}

interface ModelPlan {
  standalone?: string;
  variants?: string[];
  hyde?: string;
}

async function modelExpand(q: string, history: { role: string; content: string }[]): Promise<ModelPlan> {
  if (llmConfigProblem()) return {};
  try {
    return await chatJson<ModelPlan>({
      purpose: "rag-query",
      model: fastModel(),
      temperature: 0.3,
      maxTokens: 260,
      retry: false,
      timeoutMs: 10_000,
      messages: [
        {
          role: "system",
          content:
            "Je verbetert zoekvragen voor de kennisbank van ZekerFlex (flexwerkplatform). Geef JSON: " +
            '{"standalone": de vraag als zelfstandige zoekvraag (gebruik de context), "variants": 2 andere formuleringen, "hyde": een kort hypothetisch antwoord van 2 zinnen zoals het in een FAQ zou staan}.',
        },
        { role: "user", content: `CONTEXT: ${history.slice(-4).map((t) => `${t.role}: ${t.content.slice(0, 200)}`).join(" | ") || "-"}\nVRAAG: ${q}` },
      ],
    });
  } catch {
    return {};
  }
}

/** Keep only the sentences of a passage that carry the query's terms (plus the first one for context). */
export function compress(query: string, text: string, maxChars = 700): string {
  if (text.length <= maxChars) return text;
  const q = new Set(tokenize(query));
  const sents = sentences(text);
  const scored = sents.map((s, i) => ({ s, i, score: tokenize(s).filter((t) => q.has(t)).length + (i === 0 ? 0.5 : 0) }));
  const keep = new Set<number>();
  let len = 0;
  for (const c of [...scored].sort((a, b) => b.score - a.score)) {
    if (c.score <= 0 && keep.size) break;
    if (len + c.s.length > maxChars) continue;
    keep.add(c.i);
    len += c.s.length + 1;
  }
  return sents.filter((_, i) => keep.has(i)).join(" … ");
}

export interface AdvancedTrace {
  queries: { kind: "origineel" | "standalone" | "synoniemen" | "variant" | "hyde"; text: string }[];
  retrievers: Retriever[];
  candidates: number;
  reranked: { title: string; rerank: number; via: string[] }[];
  modelSteps: boolean;
}

export interface AdvancedHit extends RecallHit {
  rerank: number;
  /** compressed text for the prompt */
  excerpt: string;
}

export interface AdvancedRecall {
  hits: AdvancedHit[];
  confident: boolean;
  trace: AdvancedTrace;
}

export const MIN_CONFIDENT_RERANK = 0.55;

export async function advancedRecall(
  question: string,
  opts: RecallOptions & { history?: { role: string; content: string }[]; useModel?: boolean },
): Promise<AdvancedRecall> {
  const k = opts.k ?? 5;
  const history = opts.history ?? [];
  const useModel = (opts.useModel ?? true) && !llmConfigProblem();

  const queries: AdvancedTrace["queries"] = [{ kind: "origineel", text: question }];
  const sa = standalone(question, history);
  if (sa !== question) queries.push({ kind: "standalone", text: sa });
  for (const e of expandQuery(sa)) queries.push({ kind: "synoniemen", text: e });
  if (useModel) {
    const plan = await modelExpand(question, history);
    if (plan.standalone && plan.standalone !== sa) queries.push({ kind: "standalone", text: plan.standalone });
    for (const v of (plan.variants ?? []).slice(0, 2)) queries.push({ kind: "variant", text: v });
    if (plan.hyde) queries.push({ kind: "hyde", text: plan.hyde });
  }

  const results = await Promise.all(queries.map((qq) => recall(qq.text, { ...opts, k: k * 3 })));
  const fused = reciprocalRankFusion(
    results.map((r, i) => ({ name: queries[i]!.kind, items: r.hits, weight: queries[i]!.kind === "origineel" || queries[i]!.kind === "standalone" ? 1.2 : 1 })),
    (h) => h.id,
  );
  const candidates = fused.slice(0, 20).map((f) => ({ ...f.item, score: f.score, via: [...new Set([...f.item.via])] as Retriever[] }));

  const ranked = await rerank(sa, candidates, { k, vIdx: brainVectorIndex(), useModel });
  const hits: AdvancedHit[] = ranked.map((r) => ({ ...r.item, rerank: r.rerank, excerpt: compress(sa, r.item.text) }));

  const anyConfident = results.some((r) => r.confident);
  const top = hits[0];
  return {
    hits,
    confident: Boolean(top && (top.rerank >= MIN_CONFIDENT_RERANK || (anyConfident && results[0]!.hits[0]?.id === top.id))),
    trace: {
      queries,
      retrievers: [...new Set(results.flatMap((r) => r.retrievers))],
      candidates: candidates.length,
      reranked: hits.map((h) => ({ title: h.title, rerank: Number(h.rerank.toFixed(3)), via: h.via })),
      modelSteps: useModel,
    },
  };
}

/** Numbered prompt context from compressed excerpts. */
export function advancedContext(hits: AdvancedHit[], maxChars = 4000): string {
  let out = "";
  hits.forEach((h, i) => {
    const part = `[${i + 1}] ${h.title} (${h.source})\n${h.excerpt}\n\n`;
    if (out.length + part.length <= maxChars) out += part;
  });
  return out.trim();
}
