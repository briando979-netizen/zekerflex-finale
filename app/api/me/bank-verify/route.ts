import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bankLoginEnabled, getBankLogin, startBankLogin, syncBankLogin } from "@/lib/kyc/bank-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/bank-verify — is the bank-login option on, and my last outcome.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ enabled: bankLoginEnabled(), result: await getBankLogin(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.union([z.object({ action: z.literal("start") }), z.object({ action: z.literal("sync"), sessionId: z.string().max(300) })]);

// POST /api/me/bank-verify — { action: "start" } → { url } to the bank's iDEAL
// screen; { action: "sync", sessionId } after coming back → the outcome.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.action === "start") {
      await enforceRateLimit({
        name: "bank-verify",
        identifier: p.userId,
        limit: 6,
        windowSeconds: 3600,
        message: "Te veel pogingen — probeer het over een uur opnieuw.",
      });
      return NextResponse.json({ url: await startBankLogin(p.userId) });
    }
    return NextResponse.json({ result: await syncBankLogin(p.userId, body.sessionId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
