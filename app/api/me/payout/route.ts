import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getPayoutPrefs, setPayoutSpeed, PAYOUT_SPEEDS, payoutFee } from "@/lib/payouts/preferences";
import {
  advanceFee,
  listAdvances,
  maxAdvanceCents,
  outstandingAdvanceCents,
  requestAdvance,
} from "@/lib/payouts/advances";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/payout — payout speed choice + advance status.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [prefs, overview, advances, outstanding] = await Promise.all([
      getPayoutPrefs(p.userId),
      getFreelancerOverview(p.userId),
      listAdvances(p.userId),
      outstandingAdvanceCents(p.userId),
    ]);
    const pending = overview.kpis.pendingPayoutCents;
    return NextResponse.json({
      prefs,
      speeds: PAYOUT_SPEEDS,
      pendingPayoutCents: pending,
      exampleFees: {
        instant: payoutFee(pending, "instant"),
        threeDay: payoutFee(pending, "threeDay"),
        standard: 0,
      },
      advances,
      outstandingAdvanceCents: outstanding,
      maxAdvanceCents: maxAdvanceCents(pending, outstanding),
      advanceFeeRatePct: Math.round((advanceFee(10000) / 10000) * 100),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const putSchema = z.object({ speed: z.enum(["instant", "threeDay", "standard"]) });

// PUT /api/me/payout — set the payout speed.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { speed } = putSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const prefs = await setPayoutSpeed(p.userId, speed);
    return NextResponse.json({ prefs });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const advanceSchema = z.object({ amountCents: z.number().int().positive() });

// POST /api/me/payout — request a voorschot (advance).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { amountCents } = advanceSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const overview = await getFreelancerOverview(p.userId);
    try {
      const advance = await requestAdvance(p.userId, amountCents, overview.kpis.pendingPayoutCents);
      return NextResponse.json({ advance }, { status: 201 });
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
