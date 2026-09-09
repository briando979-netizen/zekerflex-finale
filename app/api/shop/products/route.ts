import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(120),
  description: z.string().trim().min(10).max(600),
  category: z.enum(["Kleding", "Werkdag", "Cadeaus"]),
  priceCents: z.number().int().nonnegative().max(1_000_000),
  costCents: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  stock: z.number().int().nonnegative().max(1_000_000),
  imageUploadId: z.string().max(128).nullable().optional(),
  modelUploadId: z.string().max(128).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  modelPhotoUrl: z.string().url().nullable().optional(),
  badge: z.string().trim().max(40).nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

// GET is intentionally public (the storefront listing) — an admin viewer adds
// x-shop-admin to also see inactive products, so this can't use withAuth's
// "session required" default. requireRole still gates that extra visibility.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const isAdmin = request.headers.get("x-shop-admin") === "true";
    if (isAdmin) {
      const principal = await getPrincipal();
      if (!principal) throw AppError.unauthenticated();
      requireRole(principal, "PLATFORM_ADMIN");
    }
    const products = await prisma.shopProduct.findMany({
      ...(isAdmin ? {} : { where: { active: true } }),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ products });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = productSchema.parse(await request.json());
  const data = {
    ...parsed,
    imageUploadId: parsed.imageUploadId ?? null,
    modelUploadId: parsed.modelUploadId ?? null,
    imageUrl: parsed.imageUrl ?? null,
    modelPhotoUrl: parsed.modelPhotoUrl ?? null,
    badge: parsed.badge ?? null,
    costCents: parsed.costCents ?? null,
  };
  const product = await prisma.shopProduct.create({ data });
  await recordAudit({ category: "ADMIN", action: "shop.product.created", actorUserId: principal.userId, actorLabel: "user", summary: `Shopproduct aangemaakt: ${product.name}`, targetType: "shop-product", targetId: product.id });
  return NextResponse.json({ product }, { status: 201 });
});
