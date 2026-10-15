import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { deleteImportedChat, getImportedChat } from "@/lib/whatsapp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/whatsapp/chats/:id — one imported chat with its messages.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  try {
    const p = await requirePrincipal();
    const found = await getImportedChat(p.userId, id);
    if (!found) throw AppError.notFound("Gesprek niet gevonden");
    return NextResponse.json(found);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/whatsapp/chats/:id — remove an imported chat.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  try {
    const p = await requirePrincipal();
    await deleteImportedChat(p.userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
