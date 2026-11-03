import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { updateWebsiteProposal } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/websitevoorstellen/<id> — what sales did with it: sent it
// (themselves), the company said no, withdraw it (site offline, address free),
// give it more time, or give a launch place back.

const schema = z.object({ action: z.enum(["verstuurd", "afgewezen", "ingetrokken", "verlengen", "plek-vrijgeven"]) });

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN", "SALES"], async (request, { params, principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const { action } = schema.parse(json);
  const proposal = await updateWebsiteProposal(params.id, action, { userId: principal.userId, name: principal.fullName || principal.email });
  return NextResponse.json({ proposal });
});
