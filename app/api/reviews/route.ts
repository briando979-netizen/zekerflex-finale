import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { addReview, hasReviewed, listReviews, reviewSummary } from "@/lib/reviews/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/reviews?type=freelancer|company&id=...  — summary + recent (6 months).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");
    if ((type !== "freelancer" && type !== "company") || !id) {
      throw AppError.validation("type (freelancer|company) en id vereist");
    }
    const [summary, all] = await Promise.all([reviewSummary(type, id), listReviews(type, id)]);
    return NextResponse.json({ summary, total: all.length });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const postSchema = z.object({
  subjectType: z.enum(["freelancer", "company"]),
  subjectId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1500).default(""),
  shiftId: z.string().min(1).optional(),
});

// POST /api/reviews — leave a review for someone you've worked with.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const me = await requirePrincipal();
    const input = postSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));

    const myRoles = me.grants.map((g) => g.role);
    const isEmployer = myRoles.some((r) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(r));
    const myTenantIds = [...new Set(me.grants.map((g) => g.organizationId))];

    let eligible = false;
    let shiftTitle: string | undefined;

    if (input.subjectType === "freelancer") {
      if (!isEmployer) throw AppError.forbidden("Alleen opdrachtgevers kunnen een kracht beoordelen.");
      const worked = await prisma.shiftAssignment.findFirst({
        where: {
          freelancer: { userId: input.subjectId },
          shift: { branch: { tenantId: { in: myTenantIds } } },
          ...(input.shiftId ? { shiftId: input.shiftId } : {}),
        },
        select: { shift: { select: { title: true } } },
      });
      eligible = Boolean(worked);
      shiftTitle = worked?.shift.title;
    } else {
      // freelancer -> company
      const worked = await prisma.shiftAssignment.findFirst({
        where: {
          freelancer: { userId: me.userId },
          shift: { branch: { tenantId: input.subjectId } },
          ...(input.shiftId ? { shiftId: input.shiftId } : {}),
        },
        select: { shift: { select: { title: true } } },
      });
      eligible = Boolean(worked);
      shiftTitle = worked?.shift.title;
    }

    if (!eligible) throw AppError.forbidden("Je kunt alleen beoordelen na een gedeelde opdracht.");
    if (await hasReviewed(input.subjectType, input.subjectId, me.userId, input.shiftId)) {
      throw AppError.validation("Je hebt hier al een beoordeling voor achtergelaten.");
    }

    const review = await addReview({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      authorId: me.userId,
      authorName: me.fullName,
      authorRole: input.subjectType === "freelancer" ? "employer" : "freelancer",
      rating: input.rating,
      text: input.text,
      ...(input.shiftId ? { shiftId: input.shiftId } : {}),
      ...(shiftTitle ? { shiftTitle } : {}),
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
