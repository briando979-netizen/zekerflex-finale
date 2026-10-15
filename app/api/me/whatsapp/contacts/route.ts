import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { clearContacts, getContacts } from "@/lib/whatsapp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/whatsapp/contacts — the caller's imported address book.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json(await getContacts(p.userId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/whatsapp/contacts — forget all imported contacts.
export async function DELETE(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await clearContacts(p.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
