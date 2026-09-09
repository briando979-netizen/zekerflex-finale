import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { proposePatch } from "@/lib/orchestration/dev-advisor";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  description: z.string().trim().min(10).max(4000),
  files: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
});

// POST /api/admin/orchestration/patch
// The code advisor: returns a PROPOSED diff + rationale. Never writes anything.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const parsed = bodySchema.parse(json);

  const proposal = await proposePatch(parsed);

  await recordAudit({
    category: "ORCHESTRATION",
    action: "orchestration.patch.proposed",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Codevoorstel gegenereerd voor: ${parsed.description.slice(0, 120)}`,
    metadata: { files: parsed.files },
  });

  return NextResponse.json({ proposal });
});
