import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { createWebsite, updateWebsiteConfig, publishWebsite } from "@/lib/website/builder";
import { z } from "zod";

export const dynamic = "force-dynamic";

const websiteSchema = z.object({
  naam: z.string().min(2),
  beschrijving: z.string().optional(),
  template: z.enum(["modern", "classic", "minimalist", "corporate"]).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const websites = await prisma.website.findMany({
      where: { tenant: { memberships: { some: { userId: principal.userId } } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      websites: websites.map((w) => ({
        id: w.id,
        naam: w.naam,
        status: w.status,
        subdomain: w.subdomain,
        customDomain: w.customDomain,
        publishedAt: w.publishedAt,
        createdAt: w.createdAt,
        url: w.customDomain || `https://${w.subdomain}.zekerflex.com`,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const body = await request.json();
    const { naam, beschrijving, template } = websiteSchema.parse(body);

    const website = await createWebsite(tenant.id, {
      naam,
      beschrijving: beschrijving || "",
      logo: "https://via.placeholder.com/200x60?text=Logo",
      kleuren: {
        primary: "#2563eb",
        secondary: "#1e40af",
        accent: "#dc2626",
      },
      fonts: ["Inter", "Playfair Display"],
      layout: (template || "modern") as any,
      headerType: "sticky",
      footerType: "standard",
    });

    return NextResponse.json({ website }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const websiteId = request.nextUrl.searchParams.get("id");

    if (!websiteId) {
      throw AppError.validation("Website ID required");
    }

    const body = await request.json();

    if (body.action === "publish") {
      const published = await publishWebsite(websiteId);
      return NextResponse.json({ website: published });
    }

    const updated = await updateWebsiteConfig(websiteId, body);
    return NextResponse.json({ website: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
