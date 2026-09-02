import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { createCommunity, listCommunitiesForUser } from "@/lib/communities/store";
import { userDirectory } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/communities — communities I'm a member of.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const communities = await listCommunitiesForUser(p.userId);
    const memberIds = [...new Set(communities.flatMap((c) => c.members.map((m) => m.userId)))];
    const directory = Object.fromEntries(await userDirectory(memberIds));
    return NextResponse.json({
      communities: communities.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        ownerId: c.ownerId,
        threadId: c.threadId ?? null,
        memberCount: c.members.length,
        members: c.members,
        myRole: c.members.find((m) => m.userId === p.userId)?.role ?? "member",
      })),
      directory,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(400).optional(),
});

// POST /api/communities — start a community (you become owner, group chat created).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = createSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const c = await createCommunity(p.userId, input.name, input.description ?? "");
    return NextResponse.json({ community: { id: c.id, name: c.name, threadId: c.threadId } }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
