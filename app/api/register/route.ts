import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { registerAccount, registerSchema } from "@/lib/auth/register";
import { sendVerificationEmail } from "@/lib/auth/email-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/register" });
  try {
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    }
    const account = await registerAccount(parsed.data);
    await sendVerificationEmail(account.userId, account.email, parsed.data.fullName).catch(() => undefined);
    return NextResponse.json({ ok: true, ...account }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("register failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
