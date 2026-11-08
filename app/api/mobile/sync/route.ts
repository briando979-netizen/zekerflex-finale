import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/require-principal";
import { syncPendingActions, markSyncCompleted } from "@/lib/mobile/background-sync";
import { jsonError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string(),
  tag: z.string().optional(),
});

/**
 * POST /api/mobile/sync — Sync offline actions
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal(request);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return jsonError(
        "Ongeldige verzoek",
        422,
      );
    }

    const { userId, tag = "sync-all" } = parsed.data;

    // Verify user
    if (principal.id !== userId) {
      return jsonError(
        "Ongeautoriseerd",
        403,
      );
    }

    // Perform sync
    const result = await syncPendingActions(userId);

    // Mark sync completed
    await markSyncCompleted(userId, tag);

    return NextResponse.json({
      success: true,
      synced: result.synced,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    return jsonError(
      (error as Error).message || "Sync mislukt",
      500,
    );
  }
}
