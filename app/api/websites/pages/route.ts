import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const pageSchema = z.object({
  titel: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().min(10),
  template: z.enum(["home", "about", "services", "portfolio", "contact", "blog", "pricing", "custom"]),
  visible: z.boolean().optional(),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const websiteId = request.nextUrl.searchParams.get("websiteId");

    if (!websiteId) {
      throw AppError.validation("Website ID required");
    }

    const body = await request.json();
    const pageData = pageSchema.parse(body);

    const page = await prisma.websitePage.create({
      data: {
        websiteId,
        ...pageData,
        order: await getNextPageOrder(websiteId),
        seoJson: JSON.stringify(pageData.seo || {}),
      },
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const websiteId = request.nextUrl.searchParams.get("websiteId");

    if (!websiteId) {
      throw AppError.validation("Website ID required");
    }

    const pages = await prisma.websitePage.findMany({
      where: { websiteId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      pages: pages.map((p) => ({
        id: p.id,
        titel: p.titel,
        slug: p.slug,
        template: p.template,
        visible: p.visible,
        order: p.order,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const pageId = request.nextUrl.searchParams.get("pageId");

    if (!pageId) {
      throw AppError.validation("Page ID required");
    }

    const body = await request.json();
    const updates = pageSchema.partial().parse(body);

    const updated = await prisma.websitePage.update({
      where: { id: pageId },
      data: {
        ...updates,
        seoJson: updates.seo ? JSON.stringify(updates.seo) : undefined,
      },
    });

    return NextResponse.json({ page: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

async function getNextPageOrder(websiteId: string): Promise<number> {
  const lastPage = await prisma.websitePage.findFirst({
    where: { websiteId },
    orderBy: { order: "desc" },
  });

  return (lastPage?.order || 0) + 1;
}
