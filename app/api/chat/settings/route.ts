import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getChatSettings, saveChatSettings } from "@/lib/messaging/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ settings: await getChatSettings(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const putSchema = z.object({
  quickReplies: z.array(z.string().max(240)).max(20).optional(),
  autoReply: z
    .object({
      enabled: z.boolean(),
      text: z.string().max(600),
      onlyWhenAway: z.boolean(),
    })
    .partial()
    .optional(),
  showReadReceipts: z.boolean().optional(),
  showOnlineStatus: z.boolean().optional(),
  statusNote: z.string().max(140).optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = putSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const settings = await saveChatSettings(p.userId, input);
    return NextResponse.json({ settings });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
