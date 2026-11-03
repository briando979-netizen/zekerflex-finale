import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { updateWebsiteProposal } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/sales/websitevoorstellen/<id> — the follow-up a salesperson does:
// sent it, the company said no, more time, or withdraw it. Handing the site to
// the company and giving launch places back is for the platform admin.

const schema = z.object({ action: z.enum(["verstuurd", "afgewezen", "ingetrokken", "verlengen"]) });

export const PATCH = withAdminAccess<{ id: string }>(["SALES", "PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const { action } = schema.parse(json);
  return NextResponse.json({ proposal: await updateWebsiteProposal(params.id, action, { userId: principal.userId, name: principal.fullName || principal.email }) });
});
