import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { acceptInvite, canManage, getCommunity, inviteToCommunity, isMember } from "@/lib/communities/store";
import { prisma } from "@/lib/prisma";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inviteSchema = z.union([
  z.object({ userId: z.string().min(1) }),
  z.object({ email: z.string().email() }),
]);

// POST /api/communities/:id/invite — invite a freelancer / anyone to the community.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const c = await getCommunity(params.id);
    if (!c || !isMember(c, p.userId)) throw AppError.notFound("Community niet gevonden");
    if (!canManage(c, p.userId)) throw AppError.forbidden("Alleen beheerders kunnen uitnodigen.");
    const input = inviteSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));

    const invite = await inviteToCommunity(
      c,
      p.userId,
      "userId" in input ? { userId: input.userId } : { email: input.email },
    );

    // If we know the user, drop them a DM with the invite so they see it in chat.
    if ("userId" in input && input.userId !== p.userId) {
      const target = await prisma.user.findUnique({ where: { id: input.userId }, select: { disabledAt: true } });
      if (target && !target.disabledAt) {
        const dm = await ensureDirectThread(p.userId, input.userId, { contextKey: `community-invite:${c.id}` });
        await postMessage(
          dm.id,
          p.userId,
          `Ik nodig je uit voor mijn community “${c.name}”. Neem deel via: /community/join/${c.id}/${invite.token}`,
        );
      }
    }

    return NextResponse.json({ invite: { token: invite.token, joinPath: `/community/join/${c.id}/${invite.token}` } }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const acceptSchema = z.object({ token: z.string().min(6) });

// PUT /api/communities/:id/invite — accept an invite (token in body).
export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { token } = acceptSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const c = await acceptInvite(params.id, token, p.userId);
    if (!c) throw AppError.validation("Uitnodiging ongeldig of verlopen.");
    return NextResponse.json({ community: { id: c.id, name: c.name, threadId: c.threadId } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
