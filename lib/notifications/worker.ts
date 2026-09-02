import { logger } from "@/lib/logger";
import { processMatchingFollowups } from "@/lib/notifications/dispatcher";

// Long-running process helper. In a serverless deployment prefer the cron
// endpoint (`/api/internal/matching/tick`); in a container / node server call
// `startMatchingFollowupWorker()` once at boot.

let handle: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startMatchingFollowupWorker(intervalMs = 15_000): void {
  if (handle) return;
  handle = setInterval(async () => {
    if (running) return; // skip overlapping ticks
    running = true;
    try {
      const result = await processMatchingFollowups();
      if (result.processed > 0) {
        logger.info("matching follow-up tick", result);
      }
    } catch (err) {
      logger.error("matching follow-up tick failed", {
        error: (err as Error).message,
      });
    } finally {
      running = false;
    }
  }, intervalMs);
  if (typeof handle.unref === "function") handle.unref();
  logger.info("matching follow-up worker started", { intervalMs });
}

export function stopMatchingFollowupWorker(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
