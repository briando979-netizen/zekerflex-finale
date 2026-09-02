import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  canManage,
  getCommunity,
  isMember,
  memberRole,
  renameCommunity,
} from "@/lib/communities/store";
import { userDirectory } from "@/lib/messaging/contacts";
import { getUserAvatars } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    const ids = c.members.map((m) => m.userId);
    const [directory, avatars] = await Promise.all([
      userDirectory(ids).then((m) => Object.fromEntries(m)),
      getUserAvatars(ids),
    ]);
    return NextResponse.json({
      community: {
        id: c.id,
        name: c.name,
        description: c.description,
        ownerId: c.ownerId,
        threadId: c.threadId ?? null,
        members: c.members,
        invites: canManage(c, p.userId) ? c.invites : [],
        myRole: memberRole(c, p.userId),
      },
      directory,
      avatars,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().max(400).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    if (!canManage(c, p.userId)) throw AppError.forbidden("Alleen beheerders kunnen dit wijzigen.");
    const input = patchSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const updated = await renameCommunity(
      c,
      input.name ?? c.name,
      input.description,
    );
    return NextResponse.json({ community: { id: updated.id, name: updated.name, description: updated.description } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
