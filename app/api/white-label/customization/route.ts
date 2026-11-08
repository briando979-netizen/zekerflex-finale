import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import * as customization from "@/lib/white-label/customization";

/**
 * White-Label Tenant Customization API
 *
 * GET /api/white-label/customization?tenantId=xxx
 *   - Get tenant customization settings
 *
 * PATCH /api/white-label/customization
 *   - Update tenant customization
 *
 * POST /api/white-label/customization/domain
 *   - Set up custom domain
 *
 * POST /api/white-label/customization/verify-domain
 *   - Verify custom domain DNS
 */

const updateCustomizationSchema = z.object({
  tenantId: z.string().min(1),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().optional(),
  customCSS: z.string().optional(),
  hideZekerFlexBranding: z.boolean().optional(),
  customLanguage: z.string().optional(),
});

const customDomainSchema = z.object({
  tenantId: z.string().min(1),
  domain: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId parameter vereist" },
        { status: 400 }
      );
    }

    const settings = await customization.getTenantCustomization(tenantId);
    return NextResponse.json({ data: settings });
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
    const validated = updateCustomizationSchema.parse(body);

    const updated = await customization.updateTenantCustomization(
      validated.tenantId,
      validated
    );

    return NextResponse.json({ data: updated });
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

    if (action === "setup-domain") {
      const validated = customDomainSchema.parse(body);
      const result = await customization.setupCustomDomain(
        validated.tenantId,
        validated.domain
      );

      return NextResponse.json({ data: result });
    }

    if (action === "verify-domain") {
      const { tenantId } = z.object({ tenantId: z.string() }).parse(body);
      const verified = await customization.verifyCustomDomain(tenantId);

      return NextResponse.json({ data: { verified } });
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
