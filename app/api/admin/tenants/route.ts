import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createTenant, listTenants, getTenant, updateTenant } from "@/lib/tenants";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
    const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;

    const tenants = await listTenants(limit, offset);
    return NextResponse.json({ tenants });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await request.json();
    const validated = createTenantSchema.parse(body);

    const tenant = await createTenant({
      ...validated,
      status: "ACTIVE",
    });

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
