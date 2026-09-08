import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { reassignAssignment } from "@/lib/replacements/reassign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/replacement/pick { requestId, substituteUserId }
// The original freelancer picks a responder; the engagement is moved in the DB.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { requestId, substituteUserId } = z
      .object({
        requestId: z.string().min(1).max(64),
        substituteUserId: z.string().min(1).max(64),
      })
      .parse(await request.json().catch(() => ({})));

    const result = await reassignAssignment({
      requestId,
      substituteUserId,
      pickedByUserId: principal.userId,
    });

    revalidatePath("/dashboard/diensten");
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
