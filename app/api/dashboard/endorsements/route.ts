import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const endorseSchema = z.object({
  skillId: z.string(),
  workerId: z.string(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      include: { skills: true },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    return NextResponse.json({
      skills: freelancer.skills.map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
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
    const { skillId, workerId } = endorseSchema.parse(await request.json());

    // Verify requester is employer/admin
    const endorsement = await prisma.skillEndorsement.upsert({
      where: {
        skillId_endorserId_workerId: {
          skillId,
          endorserId: principal.userId,
          workerId,
        },
      },
      update: { endorsedAt: new Date() },
      create: {
        skillId,
        endorserId: principal.userId,
        workerId,
        endorsedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Skill endorsed",
      endorsement,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
