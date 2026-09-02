import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { addMember, canManage, getCommunity, isMember, removeMember } from "@/lib/communities/store";
import { prisma } from "@/lib/prisma";
import { postMessage } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({ userId: z.string().min(1) });

// POST /api/communities/:id/members — owner/admin adds someone directly.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    if (!canManage(c, p.userId)) throw AppError.forbidden("Alleen beheerders kunnen leden toevoegen.");
    const { userId } = addSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, disabledAt: true } });
    if (!user || user.disabledAt) throw AppError.validation("Gebruiker niet gevonden");
    await addMember(c, userId);
    if (c.threadId) await postMessage(c.threadId, "system", `${user.fullName} is toegevoegd aan de community.`, "system");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/communities/:id/members?userId=  — remove a member, or leave yourself.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    const target = new URL(request.url).searchParams.get("userId") ?? p.userId;
    if (target !== p.userId && !canManage(c, p.userId)) {
      throw AppError.forbidden("Alleen beheerders kunnen leden verwijderen.");
    }
    try {
      await removeMember(c, target);
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
