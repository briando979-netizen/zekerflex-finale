import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enrichLead, getLead, scoreLead } from "@/lib/sales/leads";
import { draftOutreach } from "@/lib/sales/outreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });
const patchSchema = z.object({
  action: z.enum(["enrich", "score", "draft"]),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const { id } = paramsSchema.parse(params);
    return NextResponse.json({ lead: await getLead(id) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
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
    const outreach = await draftOutreach(id, principal.userId);
    return NextResponse.json({ outreach }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
