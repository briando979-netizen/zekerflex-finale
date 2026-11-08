import { NextRequest, NextResponse } from "next/server";
import { deliverWebhooks } from "@/lib/webhooks/delivery";
import { verify } from "@/lib/auth/internal";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify internal request
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authorization.slice(7);
    verify(token); // throws if invalid

    // Process all pending webhook deliveries
    await deliverWebhooks();

    return NextResponse.json({
      success: true,
      message: "Webhook processing completed",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
