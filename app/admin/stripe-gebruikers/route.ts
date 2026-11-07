import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { syncStripeUsersToAdmin, getStripeUserData } from "@/lib/integrations/stripe-user-data";

export async function GET(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "PLATFORM_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const action = request.nextUrl.searchParams.get("action") || "list";

    if (action === "sync") {
      const result = await syncStripeUsersToAdmin();
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
