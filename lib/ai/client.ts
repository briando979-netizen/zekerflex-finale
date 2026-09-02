import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { withGovernor } from "@/lib/ai/governor";

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

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

function baseUrl(): string {
  return env.LLM_BASE_URL.replace(/\/+$/, "");
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
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {}),
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
async function post(
  path: string,
  payload: unknown,
  timeoutMs: number,
): Promise<unknown> {
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
      if (!canRetry) throw err;
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
  const model = opts.model ?? env.LLM_MODEL;
  const timeoutMs = opts.timeoutMs ?? env.LLM_TIMEOUT_MS;
  return withGovernor(opts.purpose ?? "chat", async () => {
    try {
      const data = (await post(
        "/chat/completions",
        {
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.2,
          stream: false,
          keep_alive: env.LLM_KEEP_ALIVE,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        },
        timeoutMs,
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
      logger.error("llm chat failed", { error: (err as Error).message });
      throw AppError.upstream(`LLM unreachable: ${(err as Error).message}`);
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
  return env.LLM_FAST_MODEL || env.LLM_MODEL;
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
  const model = opts.model ?? env.LLM_MODEL;
  const timeoutMs = opts.timeoutMs ?? env.LLM_TIMEOUT_MS;

  const host = (() => {
    try {
      return new URL(env.LLM_BASE_URL).host;
    } catch {
      return env.LLM_BASE_URL;
    }
  })();
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
  if (!env.AI_ALLOW_REMOTE && !local) {
    throw AppError.upstream(`Soevereiniteitsgrendel: LLM_BASE_URL host "${host}" is niet lokaal.`);
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        stream: true,
        keep_alive: env.LLM_KEEP_ALIVE,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
  } catch (err) {
    throw AppError.upstream(`LLM unreachable: ${(err as Error).message}`);
  }
  if (!res.ok || !res.body) {
    throw AppError.upstream(`LLM stream HTTP ${res.status}`);
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
  if (!env.LLM_EMBED_MODEL) {
    throw AppError.upstream("No embedding model configured (LLM_EMBED_MODEL)");
  }
  return withGovernor("embed", async () => {
    const data = (await post(
      "/embeddings",
      { model: env.LLM_EMBED_MODEL, input, keep_alive: env.LLM_KEEP_ALIVE },
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
  const base = baseUrl();
  try {
    const res = await fetch(`${base}/models`, {
      signal: AbortSignal.timeout(4000),
      ...(env.LLM_API_KEY ? { headers: { Authorization: `Bearer ${env.LLM_API_KEY}` } } : {}),
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
