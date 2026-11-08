import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { targetId } = await request.json();

    const follow = await prisma.follow.create({
      data: {
        followerId: principal.userId,
        followingId: targetId,
      },
    });

    return NextResponse.json({ follow }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const follows = await prisma.follow.findMany({
      where: { followerId: principal.userId },
      take: 100,
    });

    return NextResponse.json({ count: follows.length, follows });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
