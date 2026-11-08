import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import * as onboarding from "@/lib/white-label/onboarding";

/**
 * White-Label Tenant Onboarding API
 *
 * POST /api/white-label/onboarding
 *   - Initialize onboarding
 *
 * GET /api/white-label/onboarding?tenantId=xxx
 *   - Get onboarding progress
 *
 * POST /api/white-label/onboarding/complete-step
 *   - Mark step as complete
 */

const initializeSchema = z.object({
  tenantId: z.string().min(1),
  companyName: z.string().optional(),
  companyWebsite: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
});

const completeStepSchema = z.object({
  tenantId: z.string().min(1),
  step: z.enum([
    "account_created",
    "profile_completed",
    "company_verified",
    "payment_added",
    "api_key_generated",
    "first_api_call",
    "sso_configured",
    "custom_domain_set",
    "onboarding_completed",
  ]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "complete-step") {
      const validated = completeStepSchema.parse(body);
      const result = await onboarding.completeOnboardingStep(
        validated.tenantId,
        validated.step
      );

      return NextResponse.json({ data: result });
    }

    // Default: initialize onboarding
    const validated = initializeSchema.parse(body);
    const result = await onboarding.initializeTenantOnboarding(
      validated.tenantId,
      {
        companyName: validated.companyName,
        companyWebsite: validated.companyWebsite,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
      }
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validatiefout", details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId parameter vereist" },
        { status: 400 }
      );
    }

    const progress = await onboarding.getOnboardingProgress(tenantId);
    return NextResponse.json({ data: progress });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
