import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { listFollows, setFollow } from "@/lib/worker/follows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/volgen — the employers I follow (favorieten), with their open shifts.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ follows: await listFollows(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ tenantId: z.string().min(1).max(64), follow: z.boolean() });

// POST { tenantId, follow } — follow or unfollow an employer; following = a push on every new public shift.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { tenantId, follow } = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await setFollow(p.userId, tenantId, follow));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
