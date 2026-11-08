import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/require-principal";
import { disableSubscription } from "@/lib/mobile/push-notifications";
import { jsonError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  endpoint: z.string().url(),
  userId: z.string(),
});

/**
 * POST /api/mobile/push/unsubscribe — Unsubscribe from push
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

    const { endpoint, userId } = parsed.data;

    // Verify user
    if (principal.id !== userId) {
      return jsonError(
        "Ongeautoriseerd",
        403,
      );
    }

    await disableSubscription(endpoint);

    // Mark user as opted out
    await prisma.mobileUser.update({
      where: { userId },
      data: { pushOptedIn: false },
    }).catch(() => {
      /* Ignore if no record */
    });

    return NextResponse.json({
      success: true,
      message: "Afmelden geslaagd",
    });
  } catch (error) {
    return jsonError(
      (error as Error).message || "Fout bij afmelden",
      500,
    );
  }
}
