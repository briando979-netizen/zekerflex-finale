import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { runAutopilot } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({ only: z.array(z.string().max(60)).max(20).optional() });

// POST /api/admin/autopilot/run — "Nu draaien" (all actions, or only the given ones).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const { only } = schema.parse(await request.json().catch(() => ({})));
  return NextResponse.json(await runAutopilot("handmatig", only));
});
