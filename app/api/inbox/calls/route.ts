import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getMessages, listThreadsForUser } from "@/lib/messaging/store";
import { userDirectory } from "@/lib/messaging/contacts";
import { getChatPrefs, visibleFrom } from "@/lib/messaging/thread-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox/calls — the signed-in user's call history (WhatsApp
// "Oproepen" tab), built from the call-log messages in their 1-on-1 chats.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [threads, prefs] = await Promise.all([listThreadsForUser(p.userId, false), getChatPrefs(p.userId)]);
    const direct = threads.filter((t) => t.kind === "direct" && t.participants.includes(p.userId) && !prefs.locked.includes(t.id));
    const calls: { threadId: string; peerUserId: string; at: string; mode: string; status: string; outgoing: boolean; durationSec: number | null }[] = [];
    for (const t of direct) {
      const peer = t.participants.find((u) => u !== p.userId);
      if (!peer) continue;
      const from = visibleFrom(prefs, t.id);
      for (const m of await getMessages(t.id, 400)) {
        if (m.kind !== "call" || !m.call || (from && m.at <= from)) continue;
        if (m.call.status === "started") continue; // the ended/missed/declined line tells the story
        calls.push({ threadId: t.id, peerUserId: peer, at: m.at, mode: m.call.mode, status: m.call.status, outgoing: m.from === p.userId, durationSec: m.call.durationSec ?? null });
      }
    }
    calls.sort((a, b) => (a.at < b.at ? 1 : -1));
    const top = calls.slice(0, 100);
    const directory = Object.fromEntries(await userDirectory([...new Set(top.map((c) => c.peerUserId))]));
    return NextResponse.json({ calls: top, directory });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
