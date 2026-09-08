import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { addSuppression, listSuppression, removeSuppression } from "@/lib/sales/suppression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    return NextResponse.json({ entries: await listSuppression() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const postSchema = z.object({
  email: z.string().trim().email(),
  reason: z.enum(["manual", "bounce", "complaint"]).default("manual"),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const { email, reason } = postSchema.parse(json);
    await addSuppression(email, reason, principal.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const deleteSchema = z.object({ email: z.string().trim().email() });

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const { email } = deleteSchema.parse(json);
    await removeSuppression(email, principal.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
