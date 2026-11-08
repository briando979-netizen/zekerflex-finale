import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(500).optional(),
  shiftAssignmentId: z.string(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const review = reviewSchema.parse(body);

    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id: review.shiftAssignmentId },
      include: { shift: true },
    });

    if (!assignment) {
      throw AppError.notFound("Shift assignment not found");
    }

    if (assignment.freelancerId !== principal.userId && assignment.shift.companyId !== principal.userId) {
      throw AppError.forbidden("Cannot review this shift");
    }

    const isFreelancerReview = assignment.freelancerId === principal.userId;

    const created = await prisma.shiftReview.create({
      data: {
        shiftAssignmentId: review.shiftAssignmentId,
        rating: review.rating,
        comment: review.comment,
        reviewerId: principal.userId,
        type: isFreelancerReview ? "FREELANCER_REVIEW" : "EMPLOYER_REVIEW",
      },
    });

    return NextResponse.json({ review: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const targetId = request.nextUrl.searchParams.get("targetId");

    if (!targetId) {
      throw AppError.validation("targetId required");
    }

    const reviews = await prisma.shiftReview.findMany({
      where: {
        OR: [
          { shiftAssignment: { shift: { companyId: targetId } } },
          { shiftAssignment: { freelancerId: targetId } },
        ],
      },
      include: { shiftAssignment: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const stats = await prisma.shiftReview.aggregate({
      where: {
        OR: [
          { shiftAssignment: { shift: { companyId: targetId } } },
          { shiftAssignment: { freelancerId: targetId } },
        ],
      },
      _avg: { rating: true },
      _count: { id: true },
    });

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        type: r.type,
        createdAt: r.createdAt,
      })),
      stats: {
        averageRating: stats._avg.rating || 0,
        totalReviews: stats._count.id,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
