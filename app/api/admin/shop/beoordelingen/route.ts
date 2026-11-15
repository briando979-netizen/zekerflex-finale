import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop/beoordelingen — Beheer → Webshop → Beoordelingen (lib/shop/beoordeling.ts): de nieuwste 200. Geen e-mailadres
// van de koper: de naam zoals op de site en het bestelnummer zijn genoeg om na te kijken.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const rijen = await prisma.shopReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      orderId: true,
      naam: true,
      sterren: true,
      tekst: true,
      status: true,
      createdAt: true,
      product: { select: { id: true, name: true, slug: true } },
    },
  });
  return NextResponse.json({ beoordelingen: rijen });
});
