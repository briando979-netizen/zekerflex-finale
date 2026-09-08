import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { createLead, leadsByRep } from "@/lib/sales/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  kvkNumber: z.string().trim().regex(/^\d{8}$/).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().optional(),
  contactPhone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// GET /api/sales/leads — de eigen bezoeken/leads van deze rep.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "SALES", "PLATFORM_ADMIN");
    return NextResponse.json({ leads: await leadsByRep(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/sales/leads — leg een bedrijfsbezoek vast.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "SALES", "PLATFORM_ADMIN");
    const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());

    const lead = await createLead({
      ...parsed.data,
      source: "field-visit",
      createdById: p.userId,
    });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
