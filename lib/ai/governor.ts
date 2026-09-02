import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// AI budget governor.
//
// Every call to the self-hosted model goes through `withGovernor`. It enforces:
//   - a concurrency cap (AI_MAX_CONCURRENCY)
//   - a per-minute request window (AI_REQUESTS_PER_MIN) - a "time slot": when
//     the window is full the call WAITS for the next minute instead of failing
//   - a minimum spacing between requests (AI_MIN_INTERVAL_MS)
//   - a daily token budget (AI_DAILY_TOKEN_BUDGET) as a runaway-loop breaker
//   - local-only inference unless AI_ALLOW_REMOTE is set
// Total wait is capped at AI_MAX_WAIT_MS so nothing hangs forever.
//
// Local inference (Ollama/vLLM) is free; these guards exist so a stuck loop
// can never grind tokens, money, or a provider rate limit.
// ---------------------------------------------------------------------------

const CONC_KEY = "ai:gov:concurrency";
const LAST_KEY = "ai:gov:last-request-ms";
const rateKey = (minute: number) => `ai:gov:rate:${minute}`;
const budgetKey = (day: string) => `ai:gov:tokens:${day}`;

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local|host\.docker\.internal)$/i;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function llmHost(): string {
  try {
    return new URL(env.LLM_BASE_URL).hostname;
  } catch {
    return "invalid";
  }
}

export function isLocalInference(): boolean {
  return PRIVATE_HOST.test(llmHost());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GovernorUsage {
  purpose: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  ok: boolean;
}

export interface BudgetSnapshot {
  day: string;
  tokensUsed: number;
  tokenBudget: number;
  remaining: number;
  concurrencyInUse: number;
  concurrencyMax: number;
  requestsThisMinute: number;
  requestsPerMinute: number;
  localInference: boolean;
  host: string;
}

export async function budgetSnapshot(): Promise<BudgetSnapshot> {
  const day = today();
  const minute = Math.floor(Date.now() / 60_000);
  const [used, conc, rate] = await Promise.all([
    redis.get(budgetKey(day)),
    redis.get(CONC_KEY),
    redis.get(rateKey(minute)),
  ]);
  const tokensUsed = Number(used ?? 0);
  return {
    day,
    tokensUsed,
    tokenBudget: env.AI_DAILY_TOKEN_BUDGET,
    remaining: Math.max(0, env.AI_DAILY_TOKEN_BUDGET - tokensUsed),
    concurrencyInUse: Math.max(0, Number(conc ?? 0)),
    concurrencyMax: env.AI_MAX_CONCURRENCY,
    requestsThisMinute: Number(rate ?? 0),
    requestsPerMinute: env.AI_REQUESTS_PER_MIN,
    localInference: isLocalInference(),
    host: llmHost(),
  };
}

async function reserveRate(deadline: number): Promise<number> {
  // Returns total ms waited. Loops across minute windows (the "time slot").
  let waited = 0;
  for (;;) {
    const minute = Math.floor(Date.now() / 60_000);
    const key = rateKey(minute);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 120);
    if (count <= env.AI_REQUESTS_PER_MIN) return waited;

    // Window full - give the slot back and wait for the next minute.
    await redis.decr(key);
    const msToNextMinute = 60_000 - (Date.now() % 60_000) + 20;
    if (Date.now() + msToNextMinute > deadline) {
      throw AppError.upstream(
        "AI-budget: aanvraaglimiet bereikt, wachtvenster te lang. Probeer later.",
      );
    }
    logger.info("ai governor: rate window full, waiting for next slot", {
      msToNextMinute,
    });
    await sleep(msToNextMinute);
    waited += msToNextMinute;
  }
}

async function acquireConcurrency(deadline: number): Promise<void> {
  for (;;) {
    const n = await redis.incr(CONC_KEY);
    if (n === 1) await redis.expire(CONC_KEY, 300); // self-heal a stuck counter
    if (n <= env.AI_MAX_CONCURRENCY) return;
    await redis.decr(CONC_KEY);
    if (Date.now() + 250 > deadline) {
      throw AppError.upstream("AI-budget: alle rekensloten bezet, probeer later.");
    }
    await sleep(150 + Math.random() * 200);
  }
}

async function spaceRequests(deadline: number): Promise<number> {
  if (env.AI_MIN_INTERVAL_MS <= 0) return 0;
  const last = Number((await redis.get(LAST_KEY)) ?? 0);
  const wait = last + env.AI_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    if (Date.now() + wait > deadline) return 0;
    await sleep(wait);
    await redis.set(LAST_KEY, String(Date.now()), "EX", 60);
    return wait;
  }
  await redis.set(LAST_KEY, String(Date.now()), "EX", 60);
  return 0;
}

async function recordUsage(usage: GovernorUsage, throttledMs: number): Promise<void> {
  try {
    if (usage.totalTokens > 0) {
      const key = budgetKey(today());
      const total = await redis.incrby(key, usage.totalTokens);
      if (total === usage.totalTokens) await redis.expire(key, 60 * 60 * 26);
    }
    await prisma.aiUsageLog.create({
      data: {
        purpose: usage.purpose,
        model: usage.model,
        endpointHost: llmHost(),
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs: usage.durationMs,
        throttledMs,
        ok: usage.ok,
      },
    });
  } catch (err) {
    logger.warn("ai usage log failed", { error: (err as Error).message });
  }
}

export interface GovernedResult<T> {
  value: T;
  usage: Pick<
    GovernorUsage,
    "promptTokens" | "completionTokens" | "totalTokens" | "model"
  >;
}

/**
 * Run `fn` under the governor. `fn` returns its result plus token usage so the
 * governor can bill it against the daily budget.
 */
export async function withGovernor<T>(
  purpose: string,
  fn: () => Promise<GovernedResult<T>>,
): Promise<T> {
  if (!env.AI_ALLOW_REMOTE && !isLocalInference()) {
    throw AppError.upstream(
      `Soevereiniteitsgrendel: LLM_BASE_URL host "${llmHost()}" is niet lokaal. ` +
        `Zet AI_ALLOW_REMOTE=true om dit toe te staan.`,
    );
  }

  const deadline = Date.now() + env.AI_MAX_WAIT_MS;

  // Daily budget circuit breaker (fail-open if Redis is unreachable).
  try {
    const used = Number((await redis.get(budgetKey(today()))) ?? 0);
    if (used >= env.AI_DAILY_TOKEN_BUDGET) {
      const msg = `AI-budget: dagbudget van ${env.AI_DAILY_TOKEN_BUDGET} tokens bereikt (${used}).`;
      if (env.AI_BUDGET_HARD) throw AppError.upstream(msg);
      logger.warn("ai governor: daily budget exceeded (soft)", { used });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn("ai governor: budget check skipped", { error: (err as Error).message });
  }

  let throttledMs = 0;
  let concurrencyHeld = false;
  try {
    throttledMs += await spaceRequests(deadline);
    throttledMs += await reserveRate(deadline);
    await acquireConcurrency(deadline);
    concurrencyHeld = true;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn("ai governor: throttle skipped (redis?)", {
      error: (err as Error).message,
    });
  }

  const started = Date.now();
  let ok = false;
  let out: GovernedResult<T> | null = null;
  try {
    out = await fn();
    ok = true;
    return out.value;
  } finally {
    if (concurrencyHeld) await redis.decr(CONC_KEY).catch(() => undefined);
    await recordUsage(
      {
        purpose,
        model: out?.usage.model ?? env.LLM_MODEL,
        promptTokens: out?.usage.promptTokens ?? 0,
        completionTokens: out?.usage.completionTokens ?? 0,
        totalTokens: out?.usage.totalTokens ?? 0,
        durationMs: Date.now() - started,
        ok,
      },
      throttledMs,
    );
  }
}
