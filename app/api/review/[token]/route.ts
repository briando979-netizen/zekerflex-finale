import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { isReviewToken } from "@/lib/review-requests/shared";
import { markReviewOpened, rateReview, reviewFeedback } from "@/lib/review-requests/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/review/<token> — public: the customer gives stars, or writes the
// company a private message. The token in the link is the key; IP-limited.
// The answer to a rating always includes the Google link: no review gating.

const schema = z.discriminatedUnion("action", [
  // sent by the page itself once open in a browser, so a mail client's link preview doesn't count
  z.object({ action: z.literal("geopend") }),
  z.object({ action: z.literal("sterren"), rating: z.number().int().min(1).max(5) }),
  z.object({ action: z.literal("feedback"), tekst: z.string().max(3000) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  try {
    const { token } = await params;
    if (!isReviewToken(token)) throw AppError.notFound("Deze link werkt niet (meer).");
    await enforceRateLimit({ name: "review-klant", identifier: clientIp(request), limit: 30, windowSeconds: 600, message: "Te veel pogingen. Probeer het later opnieuw." });
    const input = schema.parse(await request.json().catch(() => ({})));
    if (input.action === "geopend") {
      await markReviewOpened(token);
      return NextResponse.json({ ok: true });
    }
    if (input.action === "sterren") {
      const { req, settings } = await rateReview(token, input.rating);
      return NextResponse.json({ ok: true, rating: req.rating, google: settings.googleUrl ? `/api/review/${token}/naar-google` : null });
    }
    await reviewFeedback(token, input.tekst);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("review page action failed", { error: (err as Error).message });
    return res;
  }
}
