import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncStripeUsersToAdmin, getStripeUserData, autoFillUserFromStripe } from "@/lib/integrations/stripe-user-data";

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

    // List all Stripe users from KV
    const keys = await prisma.keyValueStore.findMany({
      where: { key: { startsWith: "stripe-user:" } },
      select: { key: true, value: true, updatedAt: true },
      take: 100,
    });

    const users = keys.map((k) => ({
      stripeAccountId: k.key.replace("stripe-user:", ""),
      data: JSON.parse(k.value as string),
      lastSync: k.updatedAt,
    }));

    return NextResponse.json({ users, total: users.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "PLATFORM_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { action, stripeAccountId, userId } = body;

    if (action === "autofill" && userId && stripeAccountId) {
      const stripeData = await getStripeUserData(stripeAccountId);
      await autoFillUserFromStripe(userId, stripeData);
      return NextResponse.json({ ok: true, message: "Profiel gevuld uit Stripe" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
