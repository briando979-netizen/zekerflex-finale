import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { LEVELS, rewardStatus } from "@/lib/rewards/levels";
import { codeFor, getRewards, referralStats } from "@/lib/rewards/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/rewards — level, badges and the personal invite link + stats.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [status, code, stats, rewards] = await Promise.all([rewardStatus(p.userId), codeFor(p.userId), referralStats(p.userId), getRewards()]);
    return NextResponse.json({
      status,
      levels: LEVELS,
      referral: { code, link: `${env.APP_BASE_URL}/r/${code}`, ...stats, rewards },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
