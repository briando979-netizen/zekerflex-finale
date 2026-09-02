import { NextResponse } from "next/server";
import { z } from "zod";
import { SalesLeadStatus } from "@prisma/client";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { createLead, listLeads } from "@/lib/sales/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  kvkNumber: z.string().trim().regex(/^\d{8}$/).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().email().optional(),
  city: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(160).optional(),
  source: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const url = new URL(request.url);
    const statusRaw = url.searchParams.get("status");
    const status = statusRaw
      ? SalesLeadStatus[statusRaw as keyof typeof SalesLeadStatus]
      : undefined;
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50),
    );
    const leads = await listLeads({ ...(status ? { status } : {}), limit });
    return NextResponse.json({ leads });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Invalid lead", parsed.error.flatten());
    }
    const lead = await createLead({
      ...parsed.data,
      createdById: principal.userId,
    });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
