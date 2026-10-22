import { after } from "next/server";

/**
 * Run work after the response (next/server `after`) — but never let a side
 * effect like a push notification fail the action itself: outside a request
 * scope (scripts, tests) `after` throws, so fall back to fire-and-forget.
 */
export function runAfter(task: () => Promise<unknown>): void {
  try {
    after(() => task().catch(() => undefined));
  } catch {
    void task().catch(() => undefined);
  }
}
