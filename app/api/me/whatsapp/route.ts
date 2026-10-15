import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getContacts, listImportedChats } from "@/lib/whatsapp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/whatsapp — the caller's imported chats and contact count.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [chats, book] = await Promise.all([listImportedChats(p.userId), getContacts(p.userId)]);
    return NextResponse.json({
      chats,
      contacts: { count: book.contacts.length, importedAt: book.importedAt || null },
      // The live link needs Meta credentials the platform doesn't have yet.
      live: { connected: false },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
