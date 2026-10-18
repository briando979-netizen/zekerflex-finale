import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { LEVELS, rewardStatus } from "@/lib/rewards/levels";
import { codeFor, getRewards, referralStats } from "@/lib/rewards/referral";
import { BUSINESS_LEVELS, businessStatus } from "@/lib/rewards/business";
import { accountForPrincipal } from "@/lib/bank/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/rewards — level, badges and the personal invite link + stats.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    const [status, code, stats, rewards, business] = await Promise.all([
      rewardStatus(p.userId),
      codeFor(p.userId),
      referralStats(p.userId),
      getRewards(),
      account.tenantId ? businessStatus(account.tenantId) : Promise.resolve(null),
    ]);
    return NextResponse.json({
      status,
      levels: LEVELS,
      business,
      businessLevels: BUSINESS_LEVELS,
      referral: { code, link: `${env.APP_BASE_URL}/r/${code}`, ...stats, rewards },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
