import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { listContacts, removeContact, saveContact } from "@/lib/messaging/contact-book";
import { userDirectory } from "@/lib/messaging/contacts";
import { getPresence } from "@/lib/messaging/presence";
import { getUserAvatars } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/contacts — saved / favourite people, with display info.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const contacts = await listContacts(p.userId);
    const ids = contacts.map((c) => c.userId);
    const [directory, presence, avatars] = await Promise.all([
      userDirectory(ids).then((m) => Object.fromEntries(m)),
      getPresence(ids),
      getUserAvatars(ids),
    ]);
    return NextResponse.json({ contacts, directory, presence, avatars });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const saveSchema = z.object({
  userId: z.string().min(1),
  label: z.string().max(80).optional(),
  favourite: z.boolean().optional(),
});

// POST /api/contacts — save or update a contact.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = saveSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    if (input.userId === p.userId) throw AppError.validation("Je kunt jezelf niet opslaan.");
    const contact = await saveContact(p.userId, input.userId, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.favourite !== undefined ? { favourite: input.favourite } : {}),
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/contacts?userId=
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const target = new URL(request.url).searchParams.get("userId");
    if (!target) throw AppError.validation("userId ontbreekt");
    await removeContact(p.userId, target);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
