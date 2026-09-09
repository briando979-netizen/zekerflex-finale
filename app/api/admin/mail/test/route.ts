import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ to: z.string().email().optional() });

// POST /api/admin/mail/test — send a probe message. Does not touch DB/Redis.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const { to } = bodySchema.parse(await request.json().catch(() => ({})));
    const target = to ?? env.MAIL_ADMIN;

    const res = await sendMail({
      to: target,
      subject: "ZekerFlex — testbericht",
      kind: "test",
      text: `Dit is een testbericht van de ZekerFlex Sovereign Box.\n\nAangevraagd door ${principal.email} op ${new Date().toLocaleString("nl-NL")}.`,
      html: `<p style="font-family:Segoe UI,Arial,sans-serif">Dit is een testbericht van de ZekerFlex Sovereign Box.</p><p style="font-family:Segoe UI,Arial,sans-serif;color:#667469;font-size:13px">Aangevraagd door ${principal.email} op ${new Date().toLocaleString("nl-NL")}.</p>`,
    });

    return NextResponse.json({
      ok: true,
      to: target,
      delivered: res.delivered,
      transport: res.transport,
      ...(res.error ? { error: res.error } : {}),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (err instanceof AppError) return NextResponse.json(body, { status });
    return NextResponse.json(body, { status });
  }
}
