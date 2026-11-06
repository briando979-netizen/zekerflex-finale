import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { zoekTrends } from "@/lib/shop/winkel-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ focus: z.string().trim().max(120).optional() });

// POST /api/admin/shop-ai/trends — actuele trends met bronnen van het web (als Google zoeken toestaat).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = schema.parse(await request.json().catch(() => ({})));
  return NextResponse.json(await zoekTrends(d.focus));
});
