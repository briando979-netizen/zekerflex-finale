import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recruiterShortlist } from "@/lib/recruiter/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ shiftId: z.string().min(1).max(60) });

// POST /api/admin/recruiter/source — shortlist kandidaten voor één vacature.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Geef een geldige vacature-id");
  const shortlist = await recruiterShortlist(parsed.data.shiftId);
  if (shortlist === null) throw AppError.notFound("Vacature niet gevonden");
  return NextResponse.json({ candidates: shortlist });
});
