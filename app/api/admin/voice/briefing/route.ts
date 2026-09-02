import { NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { checkInternalToken } from "@/lib/internal-auth";
import { speakBriefing } from "@/lib/voice/briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/voice/briefing - compose + speak a live Dutch status briefing.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const internal = checkInternalToken(request);
    if (!internal.ok) {
      const principal = await getPrincipal();
      if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
        throw AppError.forbidden("Briefing requires the internal token or PLATFORM_ADMIN");
      }
    }
    const result = await speakBriefing({ rephrase: true });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
