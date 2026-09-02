import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { llmHealth } from "@/lib/ai/client";

// ---------------------------------------------------------------------------
// Local inference watchdog.
//
// `checkLlm()` pings the model and remembers the up/down state in Redis. On a
// down->up transition it logs "hersteld" and (best effort) queues a spoken
// "Jarvis is weer online". Called by the daemon on a short interval; also
// exposed so /api/admin/health etc. reflect the last known state instantly.
// ---------------------------------------------------------------------------

const STATE_KEY = "ai:watchdog:state"; // "up" | "down"
const SINCE_KEY = "ai:watchdog:since"; // ms timestamp of the current state

export interface LlmWatchState {
  up: boolean;
  model: string;
  changed: boolean;
  downForMs: number;
  detail?: string;
}

export async function checkLlm(): Promise<LlmWatchState> {
  const health = await llmHealth();
  const now = Date.now();

  let prev: string | null = null;
  let sinceRaw: string | null = null;
  try {
    [prev, sinceRaw] = await Promise.all([
      redis.get(STATE_KEY),
      redis.get(SINCE_KEY),
    ]);
  } catch {
    /* redis down - just report current health */
  }
  const since = Number(sinceRaw ?? now);
  const nextState = health.ok ? "up" : "down";
  const changed = prev !== null && prev !== nextState;

  if (prev !== nextState) {
    try {
      await redis.set(STATE_KEY, nextState);
      await redis.set(SINCE_KEY, String(now));
    } catch {
      /* ignore */
    }
  }

  if (changed && nextState === "up") {
    const downFor = Math.round((now - since) / 1000);
    logger.info("llm watchdog: local inference recovered", { downForSeconds: downFor });
    try {
      const { announce } = await import("@/lib/voice/announce");
      await announce({
        text: `Jarvis is weer online. De lokale AI was ${downFor} seconden niet bereikbaar.`,
        category: "status",
        source: "llm-watchdog",
      });
    } catch {
      /* voice optional */
    }
  } else if (changed && nextState === "down") {
    logger.warn("llm watchdog: local inference went down", { detail: health.detail });
  }

  return {
    up: health.ok,
    model: health.model,
    changed,
    downForMs: nextState === "down" ? now - since : 0,
    ...(health.detail ? { detail: health.detail } : {}),
  };
}
