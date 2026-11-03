import { isReviewToken } from "@/lib/review-requests/shared";
import { markReviewGoogle, reviewByToken } from "@/lib/review-requests/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/review/<token>/naar-google — notes that the customer went on to
// Google, then sends them to the company's own review page. The target is the
// company's saved link, which only ever is a Google address (shared.ts), so
// this can't be used to send people anywhere else.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const found = isReviewToken(token) ? await reviewByToken(token).catch(() => null) : null;
  if (!found?.settings.googleUrl) return new Response("Deze link werkt niet (meer).", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  await markReviewGoogle(token).catch(() => undefined);
  return new Response(null, { status: 303, headers: { Location: found.settings.googleUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
