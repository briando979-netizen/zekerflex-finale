import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import * as featureGating from "@/lib/white-label/feature-gating";

/**
 * White-Label Feature Gating API
 *
 * GET /api/white-label/features?tenantId=xxx
 *   - Get all features for a tenant
 *
 * GET /api/white-label/features/check?tenantId=xxx&featureKey=xxx
 *   - Check if a feature is enabled
 *
 * PATCH /api/white-label/features
 *   - Set feature flag
 *
 * POST /api/white-label/features/enable-tier
 *   - Enable features for a tier
 */

const setFeatureFlagSchema = z.object({
  tenantId: z.string().min(1),
  featureKey: z.string().min(1),
  enabled: z.boolean(),
  percentage: z.number().int().min(0).max(100).optional(),
  value: z.string().optional(),
});

const enableTierSchema = z.object({
  tenantId: z.string().min(1),
  tier: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE", "CUSTOM"]),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const action = request.nextUrl.searchParams.get("action");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId parameter vereist" },
        { status: 400 }
      );
    }

    if (action === "check") {
      const featureKey = request.nextUrl.searchParams.get("featureKey");
      if (!featureKey) {
        return NextResponse.json(
          { error: "featureKey parameter vereist" },
          { status: 400 }
        );
      }

      const enabled = await featureGating.isFeatureEnabled(tenantId, featureKey);
      return NextResponse.json({ data: { enabled } });
    }

    // Default: get all features
    const features = await featureGating.getTenantFeatures(tenantId);
    return NextResponse.json({ data: features });
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = setFeatureFlagSchema.parse(body);

    const result = await featureGating.setFeatureFlag(
      validated.featureKey,
      validated.enabled,
      {
        tenantId: validated.tenantId,
        percentage: validated.percentage,
        value: validated.value,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "enable-tier") {
      const validated = enableTierSchema.parse(body);
      const features = await featureGating.enableTierFeatures(
        validated.tenantId,
        validated.tier
      );

      return NextResponse.json({ data: { features } });
    }

    return NextResponse.json(
      { error: "Ongeldig action parameter" },
      { status: 400 }
    );
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
