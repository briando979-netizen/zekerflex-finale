import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { lowStock } from "@/lib/shop/admin-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop/low-stock?threshold=5 — active variants running out.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const t = Math.max(0, Math.min(1000, Number(new URL(request.url).searchParams.get("threshold")) || 5));
  return NextResponse.json({ variants: await lowStock(t), threshold: t });
});
