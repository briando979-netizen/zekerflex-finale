import { NextResponse } from "next/server";
import { z } from "zod";
import { SalesLeadStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { createLead, listLeads } from "@/lib/sales/leads";
import { withAdminAccess } from "@/lib/auth/handlers";

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

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
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
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
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
});
