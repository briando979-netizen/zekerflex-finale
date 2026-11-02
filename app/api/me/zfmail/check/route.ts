import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkAddress } from "@/lib/mail/zf-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/zfmail/check?name=jan — is jan@zekerflex.com still free (checked as you type).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "zfmail-check",
      identifier: p.userId,
      limit: 120,
      windowSeconds: 600,
      message: "Even rustig aan: probeer het zo opnieuw.",
    });
    const name = new URL(request.url).searchParams.get("name") ?? "";
    return NextResponse.json(await checkAddress(name.slice(0, 80)));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
