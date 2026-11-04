import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { stuurVoorstel } from "@/lib/scans/opvolgen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ sleutel: z.string().max(40), email: z.string().trim().max(200), notitie: z.string().max(600).default("") });

// POST /api/admin/scans/opvolgen — een platformbeheerder mailt het voorstel op maat van een scan
// naar het bedrijf (lib/scans/opvolgen.ts): een mens verstuurt, nooit automatisch.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const d = schema.parse(json);
  const log = await stuurVoorstel(d.sleutel, d.email, d.notitie, { userId: principal.userId, naam: principal.fullName || principal.email, email: principal.email });
  return NextResponse.json({ ok: true, stappen: log.stappen });
});
