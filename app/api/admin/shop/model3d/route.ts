import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { attachModel3D, detachModel3D, getModel3D, model3dUrl } from "@/lib/shop/model3d";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 3D-model van een webshopproduct koppelen, bekijken of loskoppelen (alleen platformbeheer).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  const model = await getModel3D(productId);
  return NextResponse.json({ model, url: model ? model3dUrl(productId) : null });
});

const schema = z.object({ productId: z.string().min(1), uploadId: z.string().min(1) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  }));
  const product = await prisma.shopProduct.findUnique({ where: { id: body.productId }, select: { id: true } });
  if (!product) throw AppError.notFound("Product niet gevonden");
  try {
    const model = await attachModel3D(product.id, body.uploadId, principal.userId);
    return NextResponse.json({ model, url: model3dUrl(product.id) });
  } catch (err) {
    throw AppError.validation((err as Error).message);
  }
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  if (!productId) throw AppError.validation("productId ontbreekt");
  await detachModel3D(productId, principal.userId);
  return NextResponse.json({ ok: true });
});
