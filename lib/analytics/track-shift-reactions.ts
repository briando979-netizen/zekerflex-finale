import { recordServerEvent } from "@/lib/analytics/track";

export type ShiftReactionAction = "ACCEPT" | "COUNTER_OFFER" | "DECLINE" | "RESERVE";

/**
 * Track a reaction action on a shift offer.
 * Called client-side before the server action runs.
 * No freelancer IDs are tracked (privacy).
 *
 * @param shiftId - The shift/klus ID
 * @param action - The action taken: ACCEPT, COUNTER_OFFER, DECLINE, RESERVE
 */
export async function trackShiftReactionClick(shiftId: string, action: ShiftReactionAction): Promise<void> {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getSessionId(),
        events: [
          {
            type: "CUSTOM",
            path: "/werkgever/diensten/[shiftId]",
            label: `shift_reaction_${action.toLowerCase()}`,
            meta: {
              shiftId,
              action,
            },
          },
        ],
      }),
    }).catch(() => undefined);
  } catch {
    // fail silently - analytics must never break UX
  }
}

/**
 * Track a bulk reaction action on multiple shifts.
 * Called server-side after the action completes.
 */
export async function recordShiftReactionsBatch(
  shiftId: string,
  action: ShiftReactionAction,
  count: number,
): Promise<void> {
  if (count === 0) return;
  try {
    await recordServerEvent({
      path: "/api/werkgever/diensten/[shiftId]",
      label: `shift_reactions_batch_${action.toLowerCase()}`,
      type: "CUSTOM",
      meta: {
        shiftId,
        action,
        count,
      },
    });
  } catch {
    // fail silently
  }
}

/**
 * Get or create a session ID for tracking within this tab.
 * Uses sessionStorage to persist across page reloads within the same tab.
 */
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let sid = sessionStorage.getItem("zf_session_id");
    if (!sid) {
      sid = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      sessionStorage.setItem("zf_session_id", sid);
    }
    return sid;
  } catch {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}
