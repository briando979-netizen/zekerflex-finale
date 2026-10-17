import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { getRewards, setRewards } from "@/lib/rewards/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cents = z.number().int().min(0).max(100_000);

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ rewards: await getRewards() }));

// PUT /api/admin/rewards — referral bonus amounts.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const rewards = await setRewards(z.object({ referrerCents: cents, newUserCents: cents }).parse(await request.json().catch(() => ({}))));
  await recordAudit({
    category: "ADMIN",
    action: "rewards.referral_amounts",
    actorUserId: principal.userId,
    summary: `Verwijsbonus: ${rewards.referrerCents}c voor de uitnodiger, ${rewards.newUserCents}c welkomstbonus`,
    targetType: "rewards",
    targetId: "ref-rewards",
  });
  return NextResponse.json({ rewards });
});
