import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { publishExtension, installExtension, uninstallExtension } from "@/lib/marketplace/extensions";
import { z } from "zod";

export const dynamic = "force-dynamic";

const extensionQuerySchema = z.object({
  category: z.string().optional(),
  sort: z.enum(["popular", "newest", "rating"]).optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { category, sort = "popular", search } = extensionQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    let query: any = { published: true, verified: true };

    if (category) query.category = category;
    if (search) {
      query.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy =
      sort === "popular"
        ? { installs: "desc" }
        : sort === "newest"
          ? { createdAt: "desc" }
          : { rating: "desc" };

    const extensions = await prisma.extension.findMany({
      where: query,
      orderBy,
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        rating: true,
        reviews: true,
        installs: true,
        price: true,
        billing: true,
        category: true,
      },
    });

    return NextResponse.json({ extensions });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const body = await request.json();
    const { extensionId } = z.object({ extensionId: z.string().uuid() }).parse(body);

    const extension = await prisma.extension.findUnique({
      where: { id: extensionId },
    });

    if (!extension) {
      throw AppError.notFound("Extension not found");
    }

    const team = await prisma.team.findFirst({
      where: { ownerId: principal.userId },
    });

    if (!team) {
      throw AppError.validation("No team found");
    }

    const installation = await installExtension(principal.userId, extensionId, team.id);

    await prisma.installation.create({
      data: {
        userId: principal.userId,
        extensionId,
        teamId: team.id,
        apiKey: installation.apiKey,
        active: true,
      },
    });

    return NextResponse.json(installation, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
