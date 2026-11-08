import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as skillsCatalog from "@/lib/skills/catalog";
import * as trainingPrograms from "@/lib/training/programs";
import * as learningPaths from "@/lib/training/learning-paths";
import * as competencyMatrix from "@/lib/training/competency-matrix";
import * as trainingAnalytics from "@/lib/training/analytics";
import * as certifications from "@/lib/training/certifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "my-skills") {
      const skills = await skillsCatalog.getUserSkills(principal.userId);
      return NextResponse.json({ skills });
    }

    if (action === "my-certifications") {
      const certs = await certifications.getUserCertifications(principal.userId);
      return NextResponse.json({ certifications: certs });
    }

    if (action === "learning-paths") {
      const paths = await learningPaths.getPaths();
      return NextResponse.json({ paths });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action, ...data } = body;

    if (action === "enroll-program") {
      const enrollment = await trainingPrograms.enrollUser(principal.userId, data.programId);
      return NextResponse.json({ enrollment }, { status: 201 });
    }

    if (action === "complete-module") {
      const completion = await trainingPrograms.completeModule(
        data.enrollmentId,
        data.moduleId,
        data.quizScore
      );
      return NextResponse.json({ completion }, { status: 201 });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
