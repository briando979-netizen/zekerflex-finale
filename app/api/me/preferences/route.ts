import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { getPrefs, setPrefs, type UserPrefs } from "@/lib/prefs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Filesystem only (storage/prefs). No DB / Redis / auth changes.

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    return NextResponse.json(await getPrefs(principal.userId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const daypart = z.enum(["morning", "afternoon", "evening"]);
const patchSchema = z.object({
  availability: z.record(z.string(), z.array(daypart)).optional(),
  minHourlyRateCents: z.number().int().min(0).max(50000).nullable().optional(),
  desiredHourlyRateCents: z.number().int().min(0).max(50000).nullable().optional(),
  maxTravelMinutes: z.number().int().min(5).max(180).nullable().optional(),
  standby: z.boolean().optional(),
  marketplaceSeenAt: z.string().optional(),
  addAlert: z
    .object({
      label: z.string().trim().min(1).max(80),
      skill: z.string().max(60).optional(),
      minRateCents: z.number().int().min(0).max(50000).optional(),
      maxTravelMinutes: z.number().int().min(5).max(180).optional(),
      city: z.string().max(80).optional(),
    })
    .optional(),
  removeAlertId: z.string().max(64).optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const parsed = patchSchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    const current = await getPrefs(principal.userId);
    const patch: Partial<UserPrefs> = {};

    if (parsed.availability) {
      const av: UserPrefs["availability"] = {};
      for (const [k, v] of Object.entries(parsed.availability)) {
        const day = Number(k);
        if (day >= 0 && day <= 6) av[day] = [...new Set(v)];
      }
      patch.availability = av;
    }
    if (parsed.minHourlyRateCents !== undefined) patch.minHourlyRateCents = parsed.minHourlyRateCents;
    if (parsed.desiredHourlyRateCents !== undefined) patch.desiredHourlyRateCents = parsed.desiredHourlyRateCents;
    if (parsed.maxTravelMinutes !== undefined) patch.maxTravelMinutes = parsed.maxTravelMinutes;
    if (parsed.standby !== undefined) patch.standby = parsed.standby;
    if (parsed.marketplaceSeenAt !== undefined) patch.marketplaceSeenAt = parsed.marketplaceSeenAt;

    if (parsed.addAlert) {
      patch.jobAlerts = [
        ...current.jobAlerts,
        { id: randomUUID().slice(0, 10), createdAt: new Date().toISOString(), ...parsed.addAlert },
      ].slice(0, 12);
    }
    if (parsed.removeAlertId) {
      patch.jobAlerts = (patch.jobAlerts ?? current.jobAlerts).filter((a) => a.id !== parsed.removeAlertId);
    }

    return NextResponse.json(await setPrefs(principal.userId, patch));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
