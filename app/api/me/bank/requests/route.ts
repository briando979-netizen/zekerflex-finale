import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { createRequest, listRequests } from "@/lib/bank/p2p";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ amountCents: z.number().int().min(100).max(500_000), description: z.string().max(140).default("") });

// GET /api/me/bank/requests — the caller's payment requests.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    return NextResponse.json({ requests: (await listRequests(account.id)).slice(0, 30) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/requests — create a betaalverzoek (link + QR).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-request", identifier: p.userId, limit: 30, windowSeconds: 3600, message: "Te veel verzoeken in korte tijd." });
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, role } = await accountForPrincipal(p);
    if (role === "platform") throw AppError.forbidden("Niet voor de platformrekening");
    return NextResponse.json({ request: await createRequest({ account, ...input }) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
