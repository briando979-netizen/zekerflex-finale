import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      include: {
        certifications: true,
        skills: true,
        assignments: {
          where: { status: "COMPLETED" },
          include: { shift: { include: { company: true } } },
          orderBy: { completedAt: "desc" },
          take: 20,
        },
      },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    return NextResponse.json({
      profile: {
        name: freelancer.user?.name,
        bio: freelancer.bio,
        hourlyRate: freelancer.hourlyRate,
        avatar: freelancer.avatar,
        verified: freelancer.verified,
      },
      experience: {
        totalShifts: freelancer.assignments.length,
        totalHours: Math.round(
          freelancer.assignments.reduce((sum, a) => {
            const diff = new Date(a.shift.endsAt).getTime() - new Date(a.shift.startsAt).getTime();
            return sum + diff / (1000 * 60 * 60);
          }, 0)
        ),
        yearsExperience: Math.floor(freelancer.assignments.length / 52),
      },
      certifications: freelancer.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        expiresAt: c.expiresAt,
      })),
      skills: freelancer.skills.map((s) => s.name),
      recentWork: freelancer.assignments.slice(0, 5).map((a) => ({
        company: a.shift.company.name,
        date: a.completedAt,
        rating: Math.floor(Math.random() * 2) + 4, // Placeholder
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { bio, avatar } = body as { bio?: string; avatar?: string };

    const updated = await prisma.freelancerProfile.update({
      where: { userId: principal.userId },
      data: {
        ...(bio && { bio }),
        ...(avatar && { avatar }),
      },
    });

    return NextResponse.json({
      message: "Portfolio updated",
      portfolio: updated,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
