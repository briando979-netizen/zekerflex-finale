import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { analyseCollusion } from "@/lib/fraud/collusion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/admin/fraude/collusie?days=90&minScore=50 — verdachte opdrachtgever↔werknemer-paren.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const sp = new URL(request.url).searchParams;
  const sinceDays = Math.min(365, Math.max(7, Number(sp.get("days")) || 90));
  const minScore = Math.min(100, Math.max(0, Number(sp.get("minScore")) || 50));
  const pairs = await analyseCollusion({ sinceDays, minScore });
  return NextResponse.json({ sinceDays, minScore, pairs });
});
