import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { canAccess, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const key = (threadId: string, userId: string) => `chat:typing:${threadId}:${userId}`;

// POST — "I'm typing" (expires after 6s). GET — is anyone else typing?
export async function POST(
  _req: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await redis.set(key(params.threadId, p.userId), "1", "EX", 6);
  } catch {
    /* best effort */
  }
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ typing: false });
    }
    const others = thread.participants.filter((id) => id !== p.userId);
    if (others.length === 0) return NextResponse.json({ typing: false });
    const flags = await Promise.all(others.map((id) => redis.get(key(params.threadId, id))));
    return NextResponse.json({ typing: flags.some(Boolean) });
  } catch {
    return NextResponse.json({ typing: false });
  }
}
