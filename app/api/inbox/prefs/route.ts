import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { listThreadsForUser } from "@/lib/messaging/store";
import { bulkChatAction, getChatPrefs, isMuted } from "@/lib/messaging/thread-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — overview for Instellingen: muted chats and labels with counts.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const prefs = await getChatPrefs(p.userId);
    return NextResponse.json({
      muted: Object.keys(prefs.muted).filter((id) => isMuted(prefs, id)),
      labels: Object.entries(prefs.lists).map(([name, ids]) => ({ name, count: ids.length })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.union([
  z.object({ action: z.enum(["archive-all", "clear-all", "unmute-all"]) }),
  z.object({ action: z.literal("list-rename"), from: z.string().min(1).max(30), to: z.string().min(1).max(30) }),
  z.object({ action: z.literal("list-delete"), list: z.string().min(1).max(30) }),
]);

// POST — alle chats archiveren / wissen, dempen opheffen, labels hernoemen/verwijderen.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const body = schema.parse(await request.json().catch(() => ({})));
    const ids = (await listThreadsForUser(p.userId, false)).filter((t) => t.participants.includes(p.userId)).map((t) => t.id);
    try {
      await bulkChatAction(p.userId, ids, body);
    } catch (err) {
      throw AppError.validation((err as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
