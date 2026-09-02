import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getUserCard } from "@/lib/profile/card";
import { getPresence, formatLastSeen } from "@/lib/messaging/presence";
import { getChatSettings } from "@/lib/messaging/settings";
import { isSavedContact } from "@/lib/messaging/contact-book";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/profile/:userId/card — the popover shown when you click a person.
export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
): Promise<NextResponse> {
  try {
    const viewer = await requirePrincipal();
    const card = await getUserCard(params.userId);
    if (!card) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });

    const [settings, presenceMap, saved] = await Promise.all([
      getChatSettings(params.userId),
      getPresence([params.userId]),
      isSavedContact(viewer.userId, params.userId),
    ]);
    const presence = presenceMap[params.userId];
    const showPresence = settings.showOnlineStatus;

    return NextResponse.json({
      card,
      statusNote: settings.statusNote || null,
      presence: showPresence
        ? { online: presence?.online ?? false, label: formatLastSeen(presence) }
        : null,
      saved,
      isSelf: viewer.userId === params.userId,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
