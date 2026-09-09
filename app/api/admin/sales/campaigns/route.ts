import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createCampaign, listCampaigns } from "@/lib/sales/campaign";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  targetSectors: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  targetCities: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  dailyCap: z.number().int().min(1).max(500).optional(),
  sendStartHour: z.number().int().min(0).max(23).optional(),
  sendEndHour: z.number().int().min(0).max(23).optional(),
  workdaysOnly: z.boolean().optional(),
  fromAddress: z.string().trim().email().optional(),
});

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ campaigns: await listCampaigns() });
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    throw AppError.validation("Ongeldige campagne", parsed.error.flatten());
  }
  const campaign = await createCampaign({ ...parsed.data, createdById: principal.userId });
  return NextResponse.json({ campaign }, { status: 201 });
});
