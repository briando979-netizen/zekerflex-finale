import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  activateCampaign,
  deleteCampaign,
  getCampaign,
  pauseCampaign,
  setCampaignMode,
  updateCampaign,
} from "@/lib/sales/campaign";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    name: z.string().trim().min(2).max(160).optional(),
    targetSectors: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    targetCities: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    minScore: z.number().int().min(0).max(100).optional(),
    dailyCap: z.number().int().min(1).max(500).optional(),
    sendStartHour: z.number().int().min(0).max(23).optional(),
    sendEndHour: z.number().int().min(0).max(23).optional(),
    workdaysOnly: z.boolean().optional(),
    fromAddress: z.string().trim().email().nullable().optional(),
  }),
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("pause") }),
  z.object({
    action: z.literal("setMode"),
    mode: z.enum(["REVIEW", "AUTOPILOT"]),
    // Typed confirmation required to arm AUTOPILOT.
    confirm: z.string().optional(),
  }),
]);

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const { id } = paramsSchema.parse(params);
  return NextResponse.json({ campaign: await getCampaign(id) });
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const parsed = patchSchema.parse(json);

  if (parsed.action === "edit") {
    const { action: _a, ...patch } = parsed;
    return NextResponse.json({ campaign: await updateCampaign(id, patch, principal.userId) });
  }
  if (parsed.action === "activate") {
    return NextResponse.json({ campaign: await activateCampaign(id, principal.userId) });
  }
  if (parsed.action === "pause") {
    return NextResponse.json({ campaign: await pauseCampaign(id, principal.userId) });
  }
  // setMode
  if (parsed.mode === "AUTOPILOT" && parsed.confirm !== "AUTOPILOT AAN") {
    throw AppError.validation('Bevestig met de tekst "AUTOPILOT AAN" om autopilot te activeren.');
  }
  return NextResponse.json({
    campaign: await setCampaignMode(id, parsed.mode, principal.userId),
  });
});

export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  await deleteCampaign(id, principal.userId);
  return NextResponse.json({ ok: true });
});
