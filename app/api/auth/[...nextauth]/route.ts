import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth/nextauth";
import { throttleIp } from "@/lib/security/ip-throttle";
import { toErrorBody } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = handlers.GET;

// Per-IP throttle on the credentials sign-in POST: the horizontal defence the
// per-email lockout can't give (one try each against many e-mails from one IP).
// Only the credentials callback is gated; other NextAuth POSTs pass through.
export async function POST(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname.includes("/callback/credentials")) {
    try {
      await throttleIp(request, { name: "login", limit: 30, windowSeconds: 600, message: "Te veel inlogpogingen vanaf dit adres. Wacht even." });
    } catch (err) {
      const { status, body } = toErrorBody(err);
      return NextResponse.json(body, { status });
    }
  }
  return handlers.POST(request);
}
