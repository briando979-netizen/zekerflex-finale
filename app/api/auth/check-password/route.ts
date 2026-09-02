import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { isBreached, scorePassword } from "@/lib/auth/password";

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
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ score: 0, label: "zeer zwak", warnings: [], breached: false });
    }
    const { password, context = [] } = parsed.data;
    const s = scorePassword(password, context);
    const breached = await isBreached(password);
    return NextResponse.json({ ...s, breached });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
