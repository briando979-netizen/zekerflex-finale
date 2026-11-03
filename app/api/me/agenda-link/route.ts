import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { workerFeedToken } from "@/lib/worker/calendar-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const feedUrl = (token: string) => `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/public/v1/werker-agenda/${token}.ics`;

// GET /api/me/agenda-link — my secret agenda-subscription link (made on first use).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ url: feedUrl(await workerFeedToken(p.userId)) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/agenda-link — a new link; the old one stops working right away.
export async function POST(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ url: feedUrl(await workerFeedToken(p.userId, true)) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
