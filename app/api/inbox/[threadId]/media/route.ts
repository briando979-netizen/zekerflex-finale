import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { storeChatMedia } from "@/lib/messaging/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/inbox/:threadId/media  (multipart: file, optional durationSec)
// Stores a chat attachment on the box's disk. Returns the descriptor to attach
// to a message via POST /api/inbox/:threadId.
export async function POST(
  request: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Veld 'file' ontbreekt");
    const durationRaw = form.get("durationSec");
    const durationSec = durationRaw ? Number(durationRaw) : undefined;

    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const stored = await storeChatMedia(thread.id, {
        filename: file.name || "bestand",
        mimeType: file.type || "application/octet-stream",
        bytes,
        ...(durationSec && Number.isFinite(durationSec) ? { durationSec } : {}),
      });
      return NextResponse.json({ attachment: stored }, { status: 201 });
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
