import { NextResponse } from "next/server";
import { z } from "zod";
import { storeMetrics } from "@/lib/mobile/metrics";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  metrics: z.object({
    fcp: z.number().optional(),
    lcp: z.number().optional(),
    cls: z.number().optional(),
    fid: z.number().optional(),
    inp: z.number().optional(),
    ttfb: z.number().optional(),
  }),
  context: z.object({
    routePath: z.string(),
    deviceType: z.enum(["mobile", "tablet", "desktop"]),
    connectionType: z.string(),
  }),
  timestamp: z.number(),
});

/**
 * POST /api/mobile/metrics — Store Core Web Vitals
 *
 * Anonymous endpoint with IP-based rate limiting to prevent abuse.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Rate limit by IP
    await enforceRateLimit({
      name: "metrics",
      identifier: clientIp(request),
      limit: 100,
      windowSeconds: 60,
      message: "Te veel metriek verzoeken",
    });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return jsonError(
        "Ongeldige metrieken",
        422,
      );
    }

    const { userId, sessionId, metrics, context, timestamp } = parsed.data;

    // Store asynchronously (non-blocking)
    storeMetrics(userId, sessionId, metrics, context, timestamp).catch((error) => {
      console.error("Failed to store metrics:", error);
    });

    return NextResponse.json({
      success: true,
      message: "Metrieken ontvangen",
    });
  } catch (error) {
    if ((error as Error).message.includes("Te veel")) {
      return jsonError(
        (error as Error).message,
        429,
      );
    }
    return jsonError(
      "Fout bij opslaan metrieken",
      500,
    );
  }
}
