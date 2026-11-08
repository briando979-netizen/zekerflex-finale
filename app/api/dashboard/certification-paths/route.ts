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
      include: { certifications: true },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const paths = [
      {
        id: "advanced-hospitality",
        name: "Geavanceerde horeca",
        description: "Masterclass in gastfreundschap en premium service",
        completed: false,
        progress: 30,
        skills: ["leadership", "communication", "quality-service"],
        requirements: { shiftsCompleted: 50, minRating: 4.5 },
      },
      {
        id: "logistics-pro",
        name: "Logistiek professional",
        description: "Expert in magazijnmanagement en efficiëntie",
        completed: false,
        progress: 60,
        skills: ["organization", "safety", "efficiency"],
        requirements: { shiftsCompleted: 75, minRating: 4.3 },
      },
      {
        id: "customer-excellence",
        name: "Klantbeleving expert",
        description: "Specialisatie in klantgerichte service",
        completed: false,
        progress: 45,
        skills: ["empathy", "problem-solving", "communication"],
        requirements: { shiftsCompleted: 40, minRating: 4.6 },
      },
    ];

    return NextResponse.json({
      currentCertifications: freelancer.certifications.length,
      availablePaths: paths,
      earnedBadges: ["reliable", "responsive", "quality-focused"],
      nextMilestone: {
        name: "50 shifts completed",
        progress: 65,
        reward: "€50 bonus + Professional Badge",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { pathId } = body as { pathId: string };

    if (!pathId) {
      throw AppError.validation("Missing pathId");
    }

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    // Record path enrollment
    // This could be stored in a custom table or KV
    await prisma.freelancerProfile.update({
      where: { id: freelancer.id },
      data: {
        // Placeholder for certification enrollment logic
      },
    });

    return NextResponse.json({
      message: "Enrolled in certification path",
      pathId,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
