import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/require-principal";
import { storeSubscription } from "@/lib/mobile/push-notifications";
import { jsonError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  userId: z.string(),
});

/**
 * POST /api/mobile/push/subscribe — Store push subscription
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal(request);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return jsonError(
        "Ongeldige push abonnement",
        422,
      );
    }

    const { subscription, userId } = parsed.data;

    // Verify user
    if (principal.id !== userId) {
      return jsonError(
        "Ongeautoriseerd",
        403,
      );
    }

    await storeSubscription(
      userId,
      subscription,
      request.headers.get("user-agent") || undefined,
    );

    return NextResponse.json(
      { success: true, message: "Push abonnement opgeslagen" },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(
      (error as Error).message || "Fout bij opslaan push abonnement",
      500,
    );
  }
}
