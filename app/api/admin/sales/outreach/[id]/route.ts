import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  approveOutreach,
  discardOutreach,
  editOutreach,
  markOutreachSent,
} from "@/lib/sales/outreach";
import { sendOutreachMail } from "@/lib/sales/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });
const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    subject: z.string().trim().min(3).max(200).optional(),
    body: z.string().trim().min(10).max(4000).optional(),
  }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("sent") }),
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("discard") }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const { id } = paramsSchema.parse(params);
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const parsed = patchSchema.parse(json);

    if (parsed.action === "edit") {
      const updated = await editOutreach(
        id,
        {
          ...(parsed.subject !== undefined ? { subject: parsed.subject } : {}),
          ...(parsed.body !== undefined ? { body: parsed.body } : {}),
        },
        principal.userId,
      );
      return NextResponse.json({ outreach: updated });
    }
    if (parsed.action === "approve") {
      return NextResponse.json({
        outreach: await approveOutreach(id, principal.userId),
      });
    }
    if (parsed.action === "discard") {
      return NextResponse.json({
        outreach: await discardOutreach(id, principal.userId),
      });
    }
    if (parsed.action === "send") {
      // Approve if still a draft, then actually deliver the mail.
      const current = await approveOutreach(id, principal.userId).catch(() => null);
      const outcome = await sendOutreachMail(id, "manual");
      return NextResponse.json({ outcome, approved: Boolean(current) });
    }
    return NextResponse.json({
      outreach: await markOutreachSent(id, principal.userId),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
