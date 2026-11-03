import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { publishSite, setLiveBuild } from "@/lib/sites/store";
import { editableProposalSite, measureNewSite } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/websitevoorstellen/<id>/site/publish — show the edited version
// on the proposal site, or go back to an earlier one. Taking it offline is
// "Intrekken" on the proposal itself, so that the address and place come free too.

const schema = z.object({ action: z.enum(["publiceer", "terug"]), buildId: z.string().max(40).optional() });

export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const site = await editableProposalSite(params.id);
  const input = schema.parse(await request.json().catch(() => ({})));
  const by = { userId: principal.userId, name: principal.fullName || principal.email };
  const done = input.action === "terug" ? (input.buildId ? await setLiveBuild(site.id, input.buildId, by) : null) : await publishSite(site.id, by);
  if (!done) throw AppError.validation("Kies een versie.");
  // the proposal page shows the new site's score: measure what visitors now see (in the background)
  void measureNewSite(params.id).catch(() => undefined);
  return NextResponse.json({ site: done });
});
