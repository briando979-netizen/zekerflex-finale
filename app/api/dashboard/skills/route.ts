import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const skillSchema = z.object({
  naam: z.string().min(1),
  niveau: z.enum(["BEGINNER", "INTERMEDIATE", "EXPERT"]),
  gecertificeerd: z.boolean().optional(),
  vervaltDatum: z.string().datetime().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const skills = await prisma.freelancerSkill.findMany({
      where: { freelancerId: freelancer.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ skills });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const body = await request.json();
    const skill = skillSchema.parse(body);

    const created = await prisma.freelancerSkill.create({
      data: {
        ...skill,
        freelancerId: freelancer.id,
        vervaltDatum: skill.vervaltDatum ? new Date(skill.vervaltDatum) : null,
      },
    });

    return NextResponse.json({ skill: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const skillId = request.nextUrl.searchParams.get("skillId");

    if (!skillId) {
      throw AppError.validation("Skill ID required");
    }

    await prisma.freelancerSkill.delete({
      where: { id: skillId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
