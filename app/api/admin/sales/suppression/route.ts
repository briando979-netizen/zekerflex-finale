import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { addSuppression, listSuppression, removeSuppression } from "@/lib/sales/suppression";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ entries: await listSuppression() });
});

const postSchema = z.object({
  email: z.string().trim().email(),
  reason: z.enum(["manual", "bounce", "complaint"]).default("manual"),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const { email, reason } = postSchema.parse(json);
  await addSuppression(email, reason, principal.userId);
  return NextResponse.json({ ok: true });
});

const deleteSchema = z.object({ email: z.string().trim().email() });

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const { email } = deleteSchema.parse(json);
  await removeSuppression(email, principal.userId);
  return NextResponse.json({ ok: true });
});
