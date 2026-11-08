import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const ONBOARDING_STEPS = [
  { id: "profile", label: "Profiel aanmaken", required: true },
  { id: "identity_verify", label: "Identiteit verifiëren", required: true },
  { id: "bank_details", label: "Bankgegevens toevoegen", required: true },
  { id: "skills_cert", label: "Vaardigheden en certificaten", required: false },
  { id: "availability", label: "Beschikbaarheid instellen", required: false },
  { id: "profile_photo", label: "Profielfoto toevoegen", required: false },
  { id: "documents", label: "Documenten goedkeuren", required: true },
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      include: {
        freelancerProfile: true,
        verifications: true,
        bankAccounts: true,
      },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    const completedSteps = new Set<string>();

    if (user.freelancerProfile) {
      completedSteps.add("profile");
    }

    if (user.verifications?.some((v) => v.type === "IDENTITY" && v.status === "VERIFIED")) {
      completedSteps.add("identity_verify");
    }

    if (user.bankAccounts && user.bankAccounts.length > 0) {
      completedSteps.add("bank_details");
    }

    if (user.freelancerProfile?.skills && (user.freelancerProfile.skills as any[]).length > 0) {
      completedSteps.add("skills_cert");
    }

    if (user.freelancerProfile?.hasAvailability) {
      completedSteps.add("availability");
    }

    if (user.freelancerProfile?.profilePhotoUrl) {
      completedSteps.add("profile_photo");
    }

    if (user.freelancerProfile?.acceptedTerms) {
      completedSteps.add("documents");
    }

    const steps = ONBOARDING_STEPS.map((step) => ({
      ...step,
      completed: completedSteps.has(step.id),
    }));

    const completedCount = steps.filter((s) => s.completed).length;
    const requiredCount = steps.filter((s) => s.required).length;
    const progress = Math.round((completedCount / ONBOARDING_STEPS.length) * 100);

    return NextResponse.json({
      steps,
      progress,
      completed: completedCount,
      total: ONBOARDING_STEPS.length,
      allRequiredComplete: steps.filter((s) => s.required && !s.completed).length === 0,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
