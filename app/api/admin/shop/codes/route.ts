import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { createDiscountCode, listDiscountCodes, setDiscountCodeActive } from "@/lib/shop/admin-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop/codes — discount codes (Stripe promotion codes).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ codes: await listDiscountCodes() }));

const createSchema = z.object({
  code: z.string().trim().min(3).max(30),
  percentOff: z.number().min(1).max(100).optional(),
  amountOffCents: z.number().int().min(50).max(100_000).optional(),
  maxRedemptions: z.number().int().min(1).max(100_000).optional(),
  expiresAt: z.string().optional(),
  minimumCents: z.number().int().min(0).max(1_000_000).optional(),
  firstTimeOnly: z.boolean().optional(),
});

// POST /api/admin/shop/codes — new code; redeemable in Checkout straight away.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = createSchema.parse(await request.json().catch(() => ({})));
  const code = await createDiscountCode(input);
  await recordAudit({ category: "ADMIN", action: "shop.code_created", actorUserId: principal.userId, summary: `Kortingscode ${code.code} aangemaakt (${input.percentOff ? `${input.percentOff}%` : `${((input.amountOffCents ?? 0) / 100).toFixed(2)} EUR`})`, targetType: "shop-code", targetId: code.id });
  return NextResponse.json({ code }, { status: 201 });
});

// PATCH /api/admin/shop/codes — switch a code on or off.
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { id, active } = z.object({ id: z.string().min(3), active: z.boolean() }).parse(await request.json().catch(() => ({})));
  await setDiscountCodeActive(id, active);
  await recordAudit({ category: "ADMIN", action: "shop.code_toggled", actorUserId: principal.userId, summary: `Kortingscode ${id} ${active ? "aan" : "uit"}`, targetType: "shop-code", targetId: id });
  return NextResponse.json({ ok: true });
});
