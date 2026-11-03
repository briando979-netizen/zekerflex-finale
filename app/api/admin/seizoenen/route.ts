import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { THEMES, seasonOn } from "@/lib/seasons/calendar";
import { getSeasonSettings, saveSeasonSettings } from "@/lib/seasons/settings";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/seizoenen — the seasonal themes, which are on, and what is celebrated today.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () =>
  NextResponse.json({ settings: await getSeasonSettings(), themes: THEMES, vandaag: seasonOn(amsterdamDayKey(new Date())) }),
);

const schema = z.object({
  aan: z.boolean(),
  uit: z.array(z.string().max(20)).max(20),
});

// POST { aan, uit } — switch all themes, or single ones, on or off.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const settings = await saveSeasonSettings({ aan: input.aan, uit: input.uit as never }, { userId: principal.userId });
  return NextResponse.json({ settings });
});
