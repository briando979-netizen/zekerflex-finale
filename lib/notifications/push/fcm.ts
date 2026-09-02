import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Optional secondary push provider: Firebase Cloud Messaging.
//
// Kept only for native apps that still bundle the Google SDK. Web Push
// (lib/notifications/push/web-push.ts) is the primary, self-hosted channel and
// the platform works fully without any FIREBASE_* env set.
// ---------------------------------------------------------------------------

let app: App | null = null;

export function isFcmEnabled(): boolean {
  return Boolean(
    env.FIREBASE_PROJECT_ID &&
      env.FIREBASE_CLIENT_EMAIL &&
      env.FIREBASE_PRIVATE_KEY,
  );
}

function messagingApp(): App | null {
  if (app) return app;
  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // Env files store the key with literal \n; restore real newlines.
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
  return app;
}

export interface FcmResult {
  successCount: number;
  /** Tokens the service reported as permanently unregistered. */
  deadTokens: string[];
}

/** Never throws - a failed push must not abort a matching run. */
export async function sendFcm(
  tokens: string[],
  notification: { title: string; body: string },
  data: Record<string, string>,
): Promise<FcmResult> {
  const fb = messagingApp();
  if (!fb || tokens.length === 0) {
    return { successCount: 0, deadTokens: [] };
  }
  try {
    const res = await getMessaging(fb).sendEachForMulticast({
      tokens,
      notification,
      data,
      android: { priority: "high", ttl: 15 * 60 * 1000 },
      apns: { headers: { "apns-priority": "10" } },
    });
    const deadTokens: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        const t = tokens[i];
        if (t) deadTokens.push(t);
      }
    });
    return { successCount: res.successCount, deadTokens };
  } catch (err) {
    logger.error("FCM multicast failed", { error: (err as Error).message });
    return { successCount: 0, deadTokens: [] };
  }
}
