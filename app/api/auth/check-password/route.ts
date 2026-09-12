import { NextResponse } from "next/server";
import { z } from "zod";
import { isBreached, scorePassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1).max(200),
  context: z.array(z.string().max(160)).max(5).optional(),
});

// POST /api/auth/check-password — strength + breach check for the register form.
// The password is only used to compute a score and an SHA-1 prefix (HIBP
// k-anonymity); it is never stored or logged.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "check-password",
      identifier: clientIp(request),
      limit: 30,
      windowSeconds: 60,
      message: "Te veel pogingen — probeer het over een minuut opnieuw.",
    });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ score: 0, label: "zeer zwak", warnings: [], breached: false });
    }
    const { password, context = [] } = parsed.data;
    const s = scorePassword(password, context);
    const breached = await isBreached(password);
    return NextResponse.json({ ...s, breached });
  } catch (err) {
    return jsonError(err);
  }
}
