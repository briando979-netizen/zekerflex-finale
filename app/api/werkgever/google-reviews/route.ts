import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { hasRole } from "@/lib/auth";
import { withAuth } from "@/lib/auth/handlers";
import { isTenantVerified } from "@/lib/company/verified";
import { deleteReviewRequest, getReviewSettings, listReviewRequests, reviewTenantOf, saveReviewSettings, sendReviewRequest } from "@/lib/review-requests/store";
import { reviewStats } from "@/lib/review-requests/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Werkgever → Google-reviews (lib/review-requests/store.ts).
// GET    — instellingen, verzoeken en cijfers
// PUT    — Google-link, feedbackadres en bedrijfsnaam
// POST   — een klant om een review vragen
// DELETE — ?token=… een verzoek (en de gegevens van die klant) verwijderen
// ---------------------------------------------------------------------------

const settingsSchema = z.object({ googleUrl: z.string().max(600), feedbackEmail: z.string().max(200), naam: z.string().max(120) });
const sendSchema = z.object({ naam: z.string().max(120), email: z.string().max(200) });

async function body(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
}

export const GET = withAuth(async (_request, { principal }) => {
  const tenantId = await reviewTenantOf(principal);
  const [settings, requests, verified] = await Promise.all([getReviewSettings(tenantId, principal.email), listReviewRequests(tenantId), isTenantVerified(tenantId)]);
  return NextResponse.json({ settings, requests, stats: reviewStats(requests), mayRequest: verified || hasRole(principal, "PLATFORM_ADMIN") });
});

export const PUT = withAuth(async (request, { principal }) => {
  const tenantId = await reviewTenantOf(principal);
  return NextResponse.json({ settings: await saveReviewSettings(tenantId, settingsSchema.parse(await body(request)), principal) });
});

export const POST = withAuth(async (request, { principal }) => {
  const tenantId = await reviewTenantOf(principal);
  return NextResponse.json({ request: await sendReviewRequest(tenantId, sendSchema.parse(await body(request)), principal) }, { status: 201 });
});

export const DELETE = withAuth(async (request, { principal }) => {
  const tenantId = await reviewTenantOf(principal);
  await deleteReviewRequest(tenantId, new URL(request.url).searchParams.get("token") ?? "");
  return NextResponse.json({ ok: true });
});
