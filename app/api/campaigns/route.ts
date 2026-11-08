import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const campaignSchema = z.object({
  titel: z.string().min(3),
  beschrijving: z.string().optional(),
  type: z.enum(["EMAIL", "SMS", "PUSH", "SOCIAL"]),
  inhoud: z.string(),
  doelgroep: z.enum(["ALLE", "ACTIEF", "INACTIEF", "VIPS"]),
  planningDatum: z.string().datetime().optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "SENT"]).optional(),
});

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
    const data = campaignSchema.parse(body);

    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        tenantId: tenant.id,
        planningDatum: data.planningDatum ? new Date(data.planningDatum) : null,
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const campaigns = await prisma.campaign.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        titel: c.titel,
        type: c.type,
        status: c.status,
        doelgroep: c.doelgroep,
        planningDatum: c.planningDatum,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId");

    if (!campaignId) {
      throw AppError.validation("Campaign ID required");
    }

    const body = await request.json();

    if (body.action === "send") {
      const campaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "SENT", sentAt: new Date() },
      });

      return NextResponse.json({ campaign, sent: true });
    }

    const updates = campaignSchema.partial().parse(body);
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: updates,
    });

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
