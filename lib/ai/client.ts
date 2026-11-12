import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { isLocalInference, withGovernor } from "@/lib/ai/governor";
import { fixBrandName } from "@/lib/ai/brand";
import { modelForPurpose } from "@/lib/ai/models";
import { primeNode, registeredNode, registeredNodeUrl } from "@/lib/ai/node-registry";
import { getLlmApiKey } from "@/lib/ai/llm-key";
import { primeMainModel, effectiveMainModel } from "@/lib/ai/llm-model";
import { gratisAan, gratisBasis, primeGratis } from "@/lib/ai/gratis";

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
  /**
   * true = de aanroeper vangt een mislukking zelf op en meldt hem zelf: dan geen "llm chat failed" op error-niveau
   * (die komt in het foutenlogboek), alleen een info-regel. Voor de warm-cron (app/api/internal/ai/warm): tijdens een
   * uitrol staat het eigen model bewust stil, en alle 8 meldingen "llm chat failed" van 11–12 nov waren die tik.
   */
  stilBijFout?: boolean;
  /**
   * true = er wacht een mens live op dit antwoord (assistent, Jarvis, sitechat, herschrijven): bij "alles gratis" dan
   * niet drie keer zo lang wachten (gratisTimeout). Gemeten 12 nov: iemand wachtte 90 s op de assistent en kreeg daarna
   * toch het antwoord uit de regels. Het reservemodel (fallbackTarget) werkt gewoon. Alleen voor chat/chatJson: bij een
   * stream loopt de wachttijd over het hele antwoord, dus die zou een traag eigen model halverwege afkappen.
   */
  interactief?: boolean;
  /**
   * Alleen bij een stream: hoe lang hooguit tot het eerste stuk tekst (standaard EERSTE_WOORD_MS). Komt er niets, dan
   * neemt het reservemodel het over (met dezelfde grens), en anders een fout voor de eigen terugval van de aanroeper.
   * Is het eerste woord binnen, dan loopt de stream door met de ruime totaaltijd.
   */
  eersteWoordMs?: number;
}

/** Bij een stream hooguit zo lang wachten op het eerste woord (12 nov: een traag eigen model liet mensen minuten wachten). */
export const EERSTE_WOORD_MS = 30_000;

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
  if (viaRegisteredNode()) return Math.max(base, 120_000);
  return gratisTimeout(base, gratisAan(), opts.interactief === true);
}

/**
 * "Alles gratis": ons eigen model rekent op de CPU van de VPS en is trager dan
 * Gemini, waarvoor de wachttijden gekozen zijn ("timed out after 30000ms" bij de
 * orchestratie en de offerte-analyse, 7 nov). Taken op de achtergrond (≥ 20 s)
 * krijgen drie keer zo lang, hooguit 3 minuten. Korte aanroepen waar iemand op
 * wacht (telefoon, snelle keuzes: 6–15 s) houden hun grens: die hebben een eigen
 * terugval, en een beller kan geen minuten wachten. Net zo een langere aanroep
 * waar een mens live op wacht (interactief, zie ChatOptions).
 */
export function gratisTimeout(base: number, gratis: boolean, interactief = false): number {
  return gratis && !interactief && base >= 20_000 ? Math.min(base * 3, 180_000) : base;
}

function baseUrl(): string {
  // "alles gratis" (Admin → ZekerFlex AI): altijd onze eigen AI-server
  if (gratisAan()) return gratisBasis();
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
  // eerst de gratis stand: die bepaalt welke server en welk model we kiezen
  await primeGratis();
  if (!gratisAan() && usesNodeRegistry()) await primeNode();
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

/**
 * Het reservemodel (env LLM_FALLBACK_*): meestal de eigen Ollama op de server,
 * voor als het hoofdmodel (bv. Gemini op de gratis laag) na alle herhalingen
 * nog steeds 429/5xx geeft of niet te bereiken is. Null als er geen reserve is
 * of de reserve dezelfde server is als het hoofdmodel.
 */
export function fallbackTarget(): { base: string; model: string } | null {
  const base = env.LLM_FALLBACK_BASE_URL?.replace(/\/+$/, "");
  const model = env.LLM_FALLBACK_MODEL;
  if (!base || !model) return null;
  if (base === baseUrl()) return null;
  return { base, model };
}

/** Een fout waarbij de reserve zin heeft: tijdelijk (429/5xx/onbereikbaar), niet een verkeerde vraag. */
function reserveZinvol(err: unknown): boolean {
  if (isTransient(err)) return true;
  const m = err instanceof Error ? err.message : "";
  return /LLM (50[234]|429)\b|niet bereikbaar|fetch failed|ECONNREFUSED/i.test(m);
}

async function postOnce(
  path: string,
  payload: unknown,
  timeoutMs: number,
  doel?: { base: string },
): Promise<unknown> {
  const llmKey = doel ? null : await getLlmApiKey();
  const res = await fetch(`${doel?.base ?? baseUrl()}${path}`, {
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
      const payload = {
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        stream: false,
        // keep_alive is Ollama-only; remote OpenAI-compat providers (Gemini)
        // reject it with HTTP 400, so only send it for local inference.
        ...(isLocalInference() ? { keep_alive: env.LLM_KEEP_ALIVE } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      };
      let data: { model?: string; choices?: { message?: { content?: string } }[] };
      try {
        data = (await post("/chat/completions", payload, timeoutMs, opts.retry ?? true)) as typeof data;
      } catch (err) {
        const reserve = fallbackTarget();
        if (!reserve || !reserveZinvol(err)) throw err;
        // Het hoofdmodel is (even) weg: antwoord met de reserve in plaats van een foutmelding.
        logger.warn("llm hoofdmodel weg - reservemodel antwoordt", { host: llmHost(), reserve: new URL(reserve.base).host, model: reserve.model, purpose: opts.purpose });
        data = (await postOnce("/chat/completions", { ...payload, model: reserve.model, keep_alive: env.LLM_KEEP_ALIVE }, timeoutMs, reserve)) as typeof data;
      }
      const usage = readUsage(data);
      return {
        value: {
          text: fixBrandName(data.choices?.[0]?.message?.content ?? ""),
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
      if (opts.stilBijFout) logger.info("llm chat mislukt, de aanroeper meldt het zelf", { error: (err as Error).message, host: llmHost(), purpose: opts.purpose });
      else logger.error("llm chat failed", { error: (err as Error).message, host: llmHost() });
      throw unreachable(err);
    }
  });
}

/** Parse a JSON object out of a model reply, tolerating fences / preamble. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[{[]/);
  if (start === -1) throw AppError.upstream("Het taalmodel gaf geen JSON terug.");
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    throw AppError.upstream("Het taalmodel gaf onleesbare JSON terug.");
  }
}

export async function chatJson<T>(opts: Omit<ChatOptions, "json">): Promise<T> {
  const { text, raw } = await chat({ ...opts, json: true });
  try {
    return extractJson<T>(text);
  } catch (err) {
    // Alleen de vorm, nooit de inhoud: "length" = afgekapt door maxTokens, anders echt scheef.
    const finishReason = (raw as { choices?: { finish_reason?: unknown }[] } | null)?.choices?.[0]?.finish_reason;
    logger.warn("llm json onleesbaar", {
      purpose: opts.purpose ?? "chat",
      finishReason: typeof finishReason === "string" ? finishReason : "onbekend",
      tekens: text.length,
      maxTokens: opts.maxTokens ?? null,
    });
    throw err;
  }
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
  // Eén poging (hoofdmodel met zijn herhalingen, of het reservemodel): een eigen afbreekknop met twee klokken, de grens
  // tot het eerste woord en de ruime totaaltijd van nu. Het eerste woord zet de eerste klok stil.
  const grens = opts.eersteWoordMs ?? EERSTE_WOORD_MS;
  const nieuwePoging = () => {
    const ctl = new AbortController();
    const p = { ctl, teLaat: false, klokken: [] as ReturnType<typeof setTimeout>[] };
    const eerste = setTimeout(() => {
      p.teLaat = true;
      ctl.abort(new DOMException("geen eerste woord binnen de grens", "TimeoutError"));
    }, grens);
    const totaal = setTimeout(() => ctl.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), timeoutMs);
    for (const k of [eerste, totaal]) (k as { unref?: () => void }).unref?.();
    p.klokken = [eerste, totaal];
    return p;
  };
  const stopPoging = (q: ReturnType<typeof nieuwePoging>) => q.klokken.forEach((k) => clearTimeout(k));
  let poging = nieuwePoging();
  const streamOnce = (m: string, doel?: { base: string }): Promise<Response> =>
    fetch(`${doel?.base ?? baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(llmKey && !doel ? { Authorization: `Bearer ${llmKey}` } : {}),
      },
      signal: poging.ctl.signal,
      body: JSON.stringify({
        model: m,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        stream: true,
        // keep_alive is Ollama-only; remote providers (Gemini) 400 on it.
        ...(isLocalInference() || doel ? { keep_alive: env.LLM_KEEP_ALIVE } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
  const reserve = fallbackTarget();
  let opReserve = false;
  const viaReserve = async (reden: string): Promise<Response> => {
    logger.warn("llm hoofdmodel weg - reservemodel streamt", { host: llmHost(), reserve: new URL(reserve!.base).host, model: reserve!.model, reden });
    // het reservemodel krijgt een eigen poging, met dezelfde grens tot het eerste woord
    stopPoging(poging);
    poging = nieuwePoging();
    opReserve = true;
    return streamOnce(reserve!.model, reserve!);
  };
  const geenEersteWoord = () => AppError.upstream(`LLM gaf geen eerste woord binnen ${grens}ms`);

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
    // Nog steeds overbelast na de herhalingen: de reserve antwoordt.
    if (reserve && [429, 502, 503, 504].includes(res.status)) {
      res = await viaReserve(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (!reserve || (opReserve && poging.teLaat)) {
      stopPoging(poging);
      throw poging.teLaat ? geenEersteWoord() : unreachable(err);
    }
    const reden = poging.teLaat ? `geen eerste woord binnen ${grens}ms` : ((err as Error).message?.slice(0, 80) ?? "onbereikbaar");
    try {
      res = await viaReserve(reden);
    } catch {
      stopPoging(poging);
      throw poging.teLaat ? geenEersteWoord() : unreachable(err);
    }
  }
  if (!res.ok || !res.body) {
    stopPoging(poging);
    const detail = await res.text().catch(() => "");
    throw AppError.upstream(`LLM stream HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  let reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let eersteBinnen = false;
  // Hold back the trailing partial word so brand-correction (fixBrandName) is
  // never split across chunks (e.g. "Seeker" + "Flex" arriving separately).
  let pending = "";
  try {
    for (;;) {
      let stuk: ReadableStreamReadResult<Uint8Array>;
      try {
        stuk = await reader.read();
      } catch (err) {
        // de grens tot het eerste woord verstreek: één keer het reservemodel, anders de terugval van de aanroeper
        if (eersteBinnen || !poging.teLaat) throw err;
        reader.releaseLock();
        if (!reserve || opReserve) throw geenEersteWoord();
        const r = await viaReserve(`geen eerste woord binnen ${grens}ms`).catch(() => null);
        if (!r || !r.ok || !r.body) throw geenEersteWoord();
        reader = r.body.getReader();
        buffer = "";
        continue;
      }
      const { done, value } = stuk;
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
            if (!eersteBinnen) {
              // het eerste woord is er: vanaf nu alleen nog de ruime totaaltijd
              eersteBinnen = true;
              clearTimeout(poging.klokken[0]);
            }
            pending += delta;
            const cut = Math.max(pending.lastIndexOf(" "), pending.lastIndexOf("\n"), pending.lastIndexOf("\t"));
            if (cut >= 0) {
              const emit = fixBrandName(pending.slice(0, cut + 1));
              pending = pending.slice(cut + 1);
              if (emit) {
                full += emit;
                yield emit;
              }
            }
          }
        } catch {
          /* partial JSON line — ignore, next chunk completes it */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* al vrijgegeven bij de overstap naar het reservemodel */
    }
    stopPoging(poging);
  }
  if (pending) {
    const emit = fixBrandName(pending);
    full += emit;
    yield emit;
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
    // Embeddings may use a dedicated endpoint (LLM_EMBED_BASE_URL, typically
    // local Ollama) so bulk RAG-indexing doesn't burn the chat provider's
    // embedding quota. A dedicated endpoint is treated as local: no API key,
    // and keep_alive is allowed (Ollama accepts it).
    const dedicated = Boolean(env.LLM_EMBED_BASE_URL);
    const embedBase = (env.LLM_EMBED_BASE_URL ?? baseUrl()).replace(/\/+$/, "");
    const localEmbed = dedicated || isLocalInference();
    const llmKey = dedicated ? null : await getLlmApiKey();
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      res = await fetch(`${embedBase}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmKey ? { Authorization: `Bearer ${llmKey}` } : {}),
        },
        body: JSON.stringify({
          model: env.LLM_EMBED_MODEL,
          input,
          ...(localEmbed ? { keep_alive: env.LLM_KEEP_ALIVE } : {}),
        }),
        signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
      });
      if (res.ok) break;
      if (![429, 502, 503, 504].includes(res.status) || attempt === 2) {
        const detail = await res.text().catch(() => "");
        throw AppError.upstream(`LLM ${res.status}: ${detail.slice(0, 200)}`);
      }
      await sleep(800 * (attempt + 1));
    }
    const data = (await (res as Response).json()) as {
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
      // Gemini's OpenAI-compatible list says "models/gemini-…" for the model you configure as "gemini-…"
      const bare = (m: string) => m.replace(/^models\//, "");
      const model =
        served?.find((m) => bare(m) === env.LLM_MODEL) ?? served?.[0] ?? env.LLM_MODEL;
      return { ok: true, baseUrl: base, model: bare(model) };
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
