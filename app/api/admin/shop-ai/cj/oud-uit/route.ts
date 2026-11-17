import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { oudAssortimentBewaard, oudAssortimentTerug, oudAssortimentUit } from "@/lib/shop/cj/importeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop-ai/cj/oud-uit — hoeveel producten met "Terugzetten" weer aan kunnen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ bewaard: await oudAssortimentBewaard() }));

const schema = z.object({ actie: z.enum(["uit", "terug"]).default("uit") });

// POST — het oude assortiment uitzetten (alles wat aan staat, niet van CJ komt en niet van een verkoper is; de id's
// worden bewaard) of precies die producten terugzetten. Niets wordt gewist.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Kies 'uit' of 'terug'.");
  const aantal = parsed.data.actie === "terug" ? await oudAssortimentTerug(principal.userId) : await oudAssortimentUit(principal.userId);
  return NextResponse.json({ aantal, bewaard: await oudAssortimentBewaard() });
});
