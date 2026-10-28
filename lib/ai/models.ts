import { env } from "@/lib/env";
import { getRoleOverrideCached } from "@/lib/ai/llm-model";

// ---------------------------------------------------------------------------
// Model fleet — one self-hosted model per kind of work, picked by `purpose`.
//
//   main       everyday answers, writing          LLM_MODEL
//   fast       routing, reranking, short replies  LLM_FAST_MODEL     → main
//   reasoning  planning, judging, analysis        LLM_REASONING_MODEL → main
//   code       code / dev-advisor / orchestration LLM_CODE_MODEL     → main
//   translate  translations (NL/EN/PL/RO/UK/AR…)  LLM_TRANSLATE_MODEL → main
//   vision     ID/selfie, images                  LLM_VISION_MODEL   (no fallback)
//   embed      vectors for RAG                    LLM_EMBED_MODEL    (no fallback)
//
// Every role falls back to the main model when its own isn't configured,
// and lib/ai/client.ts falls back to main again when a role's model turns out
// not to be pulled on the AI node — so adding models never breaks anything.
// ---------------------------------------------------------------------------

export type ModelRole = "main" | "fast" | "reasoning" | "code" | "translate" | "vision" | "embed";

export const MODEL_ROLES: { role: ModelRole; label: string; env: string; recommended: string }[] = [
  { role: "main", label: "Hoofdmodel — antwoorden en schrijven", env: "LLM_MODEL", recommended: "qwen2.5:14b" },
  { role: "fast", label: "Snel — routeren, rerank, korte antwoorden", env: "LLM_FAST_MODEL", recommended: "llama3.2:3b" },
  { role: "reasoning", label: "Redeneren — plannen, beoordelen, analyses", env: "LLM_REASONING_MODEL", recommended: "deepseek-r1:14b" },
  { role: "code", label: "Code — dev-advies en orchestratie", env: "LLM_CODE_MODEL", recommended: "qwen2.5-coder:14b" },
  { role: "translate", label: "Vertalen — meertalige chat", env: "LLM_TRANSLATE_MODEL", recommended: "aya-expanse:8b" },
  { role: "vision", label: "Beeld — ID/selfie en foto's", env: "LLM_VISION_MODEL", recommended: "qwen2.5vl:7b" },
  { role: "embed", label: "Vectoren — RAG-embeddings", env: "LLM_EMBED_MODEL", recommended: "nomic-embed-text" },
];

/** purpose (as passed to chat/chatJson) → which kind of model does it best */
export const PURPOSE_ROLE: Record<string, ModelRole> = {
  "brain-route": "fast",
  "rag-rerank": "fast",
  "rag-query": "fast",
  "chat-assist": "fast",
  "public-chat": "fast",
  "motivation-writer": "fast",
  "rag-plan": "reasoning",
  "rag-judge": "reasoning",
  orchestration: "reasoning",
  "ai-team": "reasoning",
  autopilot: "reasoning",
  "dev-advisor": "code",
  "admin-console": "code",
  "specialist-jurist": "reasoning",
  "specialist-boekhouder": "reasoning",
  "specialist-marketeer": "main",
  "specialist-recruiter": "main",
  "specialist-analist": "reasoning",
  "specialist-compliance": "reasoning",
  translate: "translate",
  "kyc-vision": "vision",
};

function configured(role: ModelRole): string | undefined {
  switch (role) {
    case "main":
      return env.LLM_MODEL;
    case "fast":
      return env.LLM_FAST_MODEL;
    case "reasoning":
      return env.LLM_REASONING_MODEL;
    case "code":
      return env.LLM_CODE_MODEL;
    case "translate":
      return env.LLM_TRANSLATE_MODEL;
    case "vision":
      return env.LLM_VISION_MODEL;
    case "embed":
      return env.LLM_EMBED_MODEL;
  }
}

/** The model for a role. A runtime per-role override (set in Admin → Jarvis,
 *  token-free, no redeploy) wins over the env config; a text role without its
 *  own model falls back to the main model, so one big model can drive them all. */
export function modelFor(role: ModelRole): string {
  const ov = getRoleOverrideCached(role);
  if (ov) return ov;
  if (role === "main") return env.LLM_MODEL;
  const own = configured(role);
  if (own) return own;
  if (role === "vision" || role === "embed") return "";
  return getRoleOverrideCached("main") ?? env.LLM_MODEL;
}

export function roleForPurpose(purpose?: string): ModelRole {
  if (purpose?.startsWith("ai-team")) return "reasoning";
  return (purpose && PURPOSE_ROLE[purpose]) || "main";
}

export function modelForPurpose(purpose?: string): string {
  return modelFor(roleForPurpose(purpose)) || env.LLM_MODEL;
}

export interface FleetEntry {
  role: ModelRole;
  label: string;
  env: string;
  model: string;
  ownModel: boolean;
  recommended: string;
  purposes: string[];
}

export function modelFleet(): FleetEntry[] {
  return MODEL_ROLES.map((r) => ({
    ...r,
    model: modelFor(r.role),
    ownModel: Boolean(configured(r.role)),
    purposes: Object.entries(PURPOSE_ROLE)
      .filter(([, role]) => role === r.role)
      .map(([p]) => p),
  }));
}
