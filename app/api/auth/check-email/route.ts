import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(160) });

// POST /api/auth/check-email — is this address free to register?
// Returns only { valid, available } — nothing else about the account.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "check-email",
      identifier: clientIp(request),
      limit: 20,
      windowSeconds: 60,
      message: "Te veel pogingen — probeer het over een minuut opnieuw.",
    });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ valid: false, available: false });
    }
    const email = parsed.data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return NextResponse.json({ valid: true, available: !existing });
  } catch (err) {
    return jsonError(err);
  }
}
