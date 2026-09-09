import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enrichLead, getLead, scoreLead } from "@/lib/sales/leads";
import { draftOutreach } from "@/lib/sales/outreach";
import { markLeadBounced, markLeadReplied, suppressLead } from "@/lib/sales/reply";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });
const patchSchema = z.object({
  action: z.enum(["enrich", "score", "draft", "mark-replied", "mark-bounced", "suppress"]),
});

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const { id } = paramsSchema.parse(params);
  return NextResponse.json({ lead: await getLead(id) });
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const { action } = patchSchema.parse(json);

  if (action === "enrich") {
    return NextResponse.json({ lead: await enrichLead(id, principal.userId) });
  }
  if (action === "score") {
    return NextResponse.json({ lead: await scoreLead(id, principal.userId) });
  }
  if (action === "mark-replied") {
    return NextResponse.json({ lead: await markLeadReplied(id, principal.userId) });
  }
  if (action === "mark-bounced") {
    return NextResponse.json({ lead: await markLeadBounced(id, principal.userId) });
  }
  if (action === "suppress") {
    return NextResponse.json({ lead: await suppressLead(id, principal.userId) });
  }
  const outreach = await draftOutreach(id, principal.userId);
  return NextResponse.json({ outreach }, { status: 201 });
});
