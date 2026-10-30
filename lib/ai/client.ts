import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { isLocalInference, withGovernor } from "@/lib/ai/governor";
import { modelForPurpose } from "@/lib/ai/models";
import { primeNode, registeredNode, registeredNodeUrl } from "@/lib/ai/node-registry";
import { getLlmApiKey } from "@/lib/ai/llm-key";
import { primeMainModel, effectiveMainModel } from "@/lib/ai/llm-model";

// ---------------------------------------------------------------------------
// Self-hosted LLM adapter.
//
// Talks to any OpenAI-compatible endpoint running inside the Sovereign Box:
// Ollama (`/v1`), vLLM, llama.cpp server, LocalAI. There is no Anthropic /
// OpenAI SaaS dependency - `LLM_BASE_URL` points at localhost by default.
//
// Every autonomous agent that needs reasoning goes through `chat` / `chatJson`
// so the model, timeout and failure handling live in one place.
// ---------------------------------------------------------------------------

/** OpenAI-compatible multimodal content part — Ollama's /v1 endpoint accepts these for vision models. */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** A plain string for text-only turns, or parts (text + image_url) for a vision-model call. */
  content: string | ChatContentPart[];
}

/** `data:` URL for a JPEG/PNG/WebP buffer — the shape `image_url.url` expects. */
export function imageDataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the server for a JSON object (OpenAI `response_format`). */
  json?: boolean;
  timeoutMs?: number;
  model?: string;
  /** Cost-accounting label for the governor ("orchestration", "rag", ...). */
  purpose?: string;
  /**
   * false = one attempt, no retry-with-backoff. Default true.
   * The retry loop assumes a *transient* failure — the model is restarting,
   * briefly unreachable — and is worth riding out for a background job. A
   * call that blocks a live HTTP response (a form submit someone is staring
   * at) needs the opposite assumption: if LLM_BASE_URL has nothing behind it
   * at all (e.g. no Sovereign Box configured on a cloud deploy), retrying
   * turns an instant ECONNREFUSED into a multi-minute hang for nothing.
   */
  retry?: boolean;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function readUsage(raw: unknown): TokenUsage {
  const d = raw as {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const prompt = d.usage?.prompt_tokens ?? d.prompt_eval_count ?? 0;
  const completion = d.usage?.completion_tokens ?? d.eval_count ?? 0;
  const total = d.usage?.total_tokens ?? prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

export interface ChatResult {
  text: string;
  model: string;
  raw: unknown;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i;

function envHost(): string {
  try {
    return new URL(env.LLM_BASE_URL).host;
  } catch {
    return env.LLM_BASE_URL;
  }
}

/**
 * Serverless deploy whose LLM_BASE_URL still says localhost: the model lives
 * on a registered AI node without a fixed address (the owner's laptop via a
 * Cloudflare tunnel, lib/ai/node-registry.ts).
 */
function usesNodeRegistry(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) && LOCAL_HOST.test(envHost());
}

/** True while requests go to a registered tunnel node (which can't stream SSE reliably). */
export function viaRegisteredNode(): boolean {
  return usesNodeRegistry() && Boolean(registeredNodeUrl());
}

/**
 * A home/laptop node behind a tunnel does CPU inference and cold model loads,
 * so a first answer can take far longer than a datacenter model. Give those
 * calls a generous timeout floor (≥120s) so they don't hit a short env cap
 * (e.g. 30s) and fail before the model has even finished loading.
 */
function timeoutFor(opts: ChatOptions): number {
  const base = opts.timeoutMs ?? env.LLM_TIMEOUT_MS;
  return viaRegisteredNode() ? Math.max(base, 120_000) : base;
}

function baseUrl(): string {
  const node = usesNodeRegistry() ? registeredNodeUrl() : null;
  return node ? `${node}/v1` : env.LLM_BASE_URL.replace(/\/+$/, "");
}

function llmHost(): string {
  try {
    return new URL(baseUrl()).host;
  } catch {
    return env.LLM_BASE_URL;
  }
}

/** Make sure this instance knows the registered AI node (cheap, cached ~20 s). */
export async function ensureAiNode(): Promise<void> {
  if (usesNodeRegistry()) await primeNode();
  await primeMainModel();
}

/**
 * A deploy that can never reach its model: on Vercel (or any serverless
 * host) "localhost" has no Ollama behind it. Answer that instantly and in
 * plain Dutch instead of retrying for two minutes and surfacing
 * "fetch failed".
 */
export function llmConfigProblem(): string | null {
  if (usesNodeRegistry()) {
    if (registeredNodeUrl()) return null; // the owner's AI node checked in recently
    void primeNode(); // refresh in the background so the next call sees a node that just came online
    const last = registeredNode();
    return last
      ? `De AI-laptop is offline (laatst gezien ${new Date(last.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}). Start deploy/ai-node/windows/start-ai-node.ps1 op de laptop, of zet LLM_BASE_URL naar een vaste AI-server.`
      : "Er is nog geen taalmodel gekoppeld aan de live omgeving: LLM_BASE_URL wijst naar localhost en er heeft zich nog geen AI-laptop/-server aangemeld. Start deploy/ai-node/windows/start-ai-node.ps1 op je laptop, of zet LLM_BASE_URL naar een vaste AI-server.";
  }
  // Same rule as the sovereignty lock in chatStream: a remote model server
  // needs an explicit AI_ALLOW_REMOTE=true — say so instead of failing per call.
  if (!env.AI_ALLOW_REMOTE && !isLocalInference()) {
    return `LLM_BASE_URL wijst naar ${llmHost()}, maar AI_ALLOW_REMOTE staat niet op true. Zet AI_ALLOW_REMOTE=true in de omgevingsvariabelen om je eigen AI-server te gebruiken.`;
  }
  return null;
}


function unreachable(err: unknown): AppError {
  return AppError.upstream(`Taalmodel niet bereikbaar op ${llmHost()} (${(err as Error).message}). Controleer of de modelserver draait en LLM_BASE_URL klopt.`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Worth retrying = the model is *coming back* (connection refused / reset,
 * Ollama restarting, 502/503/504/429). A TIMEOUT is NOT retried: it means the
 * model is genuinely slow on this hardware, and hammering it again only makes
 * it worse - the caller degrades instead.
 */
function isTransient(err: unknown): boolean {
  if (err instanceof AppError) {
    return /LLM (50[234]|429)\b/.test(err.message);
  }
  return (err as Error)?.name === "TypeError"; // fetch failed / ECONNREFUSED
}

async function postOnce(
  path: string,
  payload: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const llmKey = await getLlmApiKey();
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(llmKey ? { Authorization: `Bearer ${llmKey}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 404 && /model.*not found|not found.*model/i.test(detail)) {
      const model =
        detail.match(/model '([^']+)'/i)?.[1] ??
        (path.includes("embed") ? env.LLM_EMBED_MODEL : env.LLM_MODEL);
      throw AppError.upstream(
        `Lokaal model "${model}" is niet gedownload. Draai: ollama pull ${model}`,
      );
    }
    throw AppError.upstream(`LLM ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * POST with fail-safe auto-retry. A transient failure (Ollama restarting,
 * loading the model, briefly unreachable) is retried with exponential backoff
 * so it never surfaces to the user. A hard failure (bad request, or the retry
 * budget is spent) still throws so callers can degrade gracefully.
 */
// Circuit breaker: once the model server has been unreachable through a whole
// retry round, every call for the next minute makes ONE attempt (an instant
// ECONNREFUSED) instead of another ~40 s backoff — so chat, assist and the
// specialists fall back to their rule-based answers right away.
const BREAKER_MS = 60_000;
let downUntil = 0;
export function _resetLlmBreaker() {
  downUntil = 0;
}

async function post(
  path: string,
  payload: unknown,
  timeoutMs: number,
  retry = true,
): Promise<unknown> {
  if (!retry || Date.now() < downUntil) {
    try {
      const out = await postOnce(path, payload, timeoutMs);
      downUntil = 0;
      return out;
    } catch (err) {
      if (isTransient(err)) downUntil = Date.now() + BREAKER_MS;
      throw err;
    }
  }
  const deadline = Date.now() + env.LLM_RETRY_MAX_WAIT_MS;
  let attempt = 0;
  for (;;) {
    try {
      return await postOnce(path, payload, timeoutMs);
    } catch (err) {
      attempt += 1;
      const canRetry =
        isTransient(err) &&
        attempt <= env.LLM_RETRY_MAX &&
        Date.now() < deadline;
      if (!canRetry) {
        if (isTransient(err)) downUntil = Date.now() + BREAKER_MS;
        throw err;
      }
      const jitter = Math.random() * env.LLM_RETRY_BASE_MS;
      const wait = Math.min(
        env.LLM_RETRY_BASE_MS * 2 ** (attempt - 1) + jitter,
        Math.max(0, deadline - Date.now()),
      );
      logger.warn("llm transient failure - retrying", {
        attempt,
        waitMs: Math.round(wait),
        error: (err as Error).message,
      });
      await sleep(wait);
    }
  }
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  await ensureAiNode();
  try {
    return await chatOnce(opts);
  } catch (err) {
    // a specialised model (reasoning/code/translate/fast) that isn't pulled on
    // the AI node yet → answer with the main model instead of failing
    const main = effectiveMainModel();
    const model = opts.model ?? modelForPurpose(opts.purpose);
    if (err instanceof AppError && /niet gedownload/.test(err.message) && model !== main) {
      logger.warn("llm model missing — falling back to main model", { model, purpose: opts.purpose });
      return chatOnce({ ...opts, model: main });
    }
    throw err;
  }
}

async function chatOnce(opts: ChatOptions): Promise<ChatResult> {
  const problem = llmConfigProblem();
  if (problem) throw AppError.upstream(problem);
  const model = opts.model ?? modelForPurpose(opts.purpose);
  const timeoutMs = timeoutFor(opts);
  return withGovernor(opts.purpose ?? "chat", async () => {
    try {
      const data = (await post(
        "/chat/completions",
        {
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.2,
          stream: false,
          // keep_alive is Ollama-only; remote OpenAI-compat providers (Gemini)
          // reject it with HTTP 400, so only send it for local inference.
          ...(isLocalInference() ? { keep_alive: env.LLM_KEEP_ALIVE } : {}),
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        },
        timeoutMs,
        opts.retry ?? true,
      )) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const usage = readUsage(data);
      return {
        value: {
          text: data.choices?.[0]?.message?.content ?? "",
          model: data.model ?? model,
          raw: data,
        } satisfies ChatResult,
        usage: { ...usage, model: data.model ?? model },
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if ((err as Error).name === "TimeoutError") {
        throw AppError.upstream(`LLM request timed out after ${timeoutMs}ms`);
      }
      logger.error("llm chat failed", { error: (err as Error).message, host: llmHost() });
      throw unreachable(err);
    }
  });
}

/** Parse a JSON object out of a model reply, tolerating fences / preamble. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[{[]/);
  if (start === -1) throw AppError.upstream("LLM did not return JSON");
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    throw AppError.upstream("LLM returned malformed JSON");
  }
}

export async function chatJson<T>(opts: Omit<ChatOptions, "json">): Promise<T> {
  const { text } = await chat({ ...opts, json: true });
  return extractJson<T>(text);
}

/** The small/fast model for greetings + short chat; falls back to the main model. */
export function fastModel(): string {
  return modelForPurpose("public-chat");
}

/**
 * Streaming chat — yields text deltas as they arrive. Used by the public chat
 * widget and quick Jarvis replies so answers appear word by word instead of
 * after a 60s wait. Sovereignty guard inline; NO governor accounting (these are
 * short, low-risk turns — the non-streaming paths stay governed).
 */
export async function* chatStream(
  opts: ChatOptions,
): AsyncGenerator<string, { text: string; model: string }, void> {
  await ensureAiNode();
  const problem = llmConfigProblem();
  if (problem) throw AppError.upstream(problem);
  // A quick tunnel to the owner's laptop doesn't carry server-sent events
  // reliably: ask for the whole answer and hand it over as one chunk.
  if (viaRegisteredNode()) {
    const whole = await chat({ ...opts, retry: false });
    if (whole.text) yield whole.text;
    return { text: whole.text, model: whole.model };
  }
  const model = opts.model ?? modelForPurpose(opts.purpose);
  const timeoutMs = timeoutFor(opts);

  const host = (() => {
    try {
      return new URL(env.LLM_BASE_URL).host;
    } catch {
      return env.LLM_BASE_URL;
    }
  })();
  const local = isLocalInference();
  if (!env.AI_ALLOW_REMOTE && !local) {
    throw AppError.upstream(`Soevereiniteitsgrendel: LLM_BASE_URL host "${host}" is niet lokaal.`);
  }

  const llmKey = await getLlmApiKey();
  const streamOnce = (m: string): Promise<Response> =>
    fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(llmKey ? { Authorization: `Bearer ${llmKey}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: m,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        stream: true,
        // keep_alive is Ollama-only; remote providers (Gemini) 400 on it.
        ...(isLocalInference() ? { keep_alive: env.LLM_KEEP_ALIVE } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });

  let res: Response;
  try {
    res = await streamOnce(model);
    // Tijdelijke overbelasting (bv. Gemini's gratis laag: 429/502/503/504) →
    // kort opnieuw proberen i.p.v. de gebruiker een foutmelding tonen.
    for (let attempt = 0; attempt < 3 && [429, 502, 503, 504].includes(res.status); attempt++) {
      await sleep(600 * (attempt + 1));
      res = await streamOnce(model);
    }
    // Rol-model niet gedownload op de node (Ollama → 404)? Val terug op het
    // hoofdmodel — net als de non-stream post — zodat de stream niet hard faalt
    // op een verkeerd/ontbrekend model (bv. een oude fleet-override).
    if (res.status === 404 && model !== env.LLM_MODEL) {
      res = await streamOnce(env.LLM_MODEL);
    }
  } catch (err) {
    throw unreachable(err);
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw AppError.upstream(`LLM stream HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield delta;
          }
        } catch {
          /* partial JSON line — ignore, next chunk completes it */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text: full, model };
}

export async function embed(input: string | string[]): Promise<number[][]> {
  await ensureAiNode();
  const problem = llmConfigProblem();
  if (problem) throw AppError.upstream(problem);
  if (!env.LLM_EMBED_MODEL) {
    throw AppError.upstream("No embedding model configured (LLM_EMBED_MODEL)");
  }
  return withGovernor("embed", async () => {
    const data = (await post(
      "/embeddings",
      // keep_alive is Ollama-only; remote providers (Gemini) 400 on it.
      { model: env.LLM_EMBED_MODEL, input, ...(isLocalInference() ? { keep_alive: env.LLM_KEEP_ALIVE } : {}) },
      env.LLM_TIMEOUT_MS,
    )) as {
      data?: { embedding: number[] }[];
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    const vectors = (data.data ?? []).map((d) => d.embedding);
    const tokens = data.usage?.total_tokens ?? data.usage?.prompt_tokens ?? 0;
    return {
      value: vectors,
      usage: {
        promptTokens: tokens,
        completionTokens: 0,
        totalTokens: tokens,
        model: env.LLM_EMBED_MODEL as string,
      },
    };
  });
}

export interface LlmHealth {
  ok: boolean;
  baseUrl: string;
  model: string;
  detail?: string;
}

/**
 * Liveness probe. "up" = the inference server answers at all — NOT "a model is
 * already warm". A cold CPU model can take 30-60s for its first token, which is
 * not a fault; hammering it with a chat/completions ping and a 5s deadline would
 * report a false outage. So we hit the cheap `/models` endpoint (OpenAI-compat;
 * Ollama serves it) and only fall back to a tiny completion if that route 404s.
 * NO governor, NO retry.
 */
export async function llmHealth(): Promise<LlmHealth> {
  await ensureAiNode();
  const base = baseUrl();
  const problem = llmConfigProblem();
  if (problem) return { ok: false, baseUrl: base, model: env.LLM_MODEL, detail: problem };
  const llmKey = await getLlmApiKey();
  try {
    const res = await fetch(`${base}/models`, {
      signal: AbortSignal.timeout(4000),
      ...(llmKey ? { headers: { Authorization: `Bearer ${llmKey}` } } : {}),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      const served = body?.data?.map((m) => m.id).filter(Boolean) as string[] | undefined;
      const model =
        served?.find((m) => m === env.LLM_MODEL) ?? served?.[0] ?? env.LLM_MODEL;
      return { ok: true, baseUrl: base, model };
    }
    if (res.status !== 404) {
      return { ok: false, baseUrl: base, model: env.LLM_MODEL, detail: `models endpoint HTTP ${res.status}` };
    }
    // Route not present — try a minimal completion instead (generous deadline).
    const data = (await postOnce(
      "/chat/completions",
      { model: env.LLM_MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false, keep_alive: env.LLM_KEEP_ALIVE },
      12_000,
    )) as { model?: string };
    return { ok: true, baseUrl: base, model: data.model ?? env.LLM_MODEL };
  } catch (err) {
    return { ok: false, baseUrl: base, model: env.LLM_MODEL, detail: (err as Error).message };
  }
}

/** Model ids the AI node actually serves (empty when unreachable / not configured). */
export async function servedModels(): Promise<string[]> {
  await ensureAiNode();
  if (llmConfigProblem()) return [];
  const llmKey = await getLlmApiKey();
  try {
    const res = await fetch(`${baseUrl()}/models`, {
      signal: AbortSignal.timeout(4000),
      ...(llmKey ? { headers: { Authorization: `Bearer ${llmKey}` } } : {}),
    });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    return (body?.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}
