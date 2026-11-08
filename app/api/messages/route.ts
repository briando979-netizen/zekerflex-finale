import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  recipientId: z.string(),
  content: z.string().min(1).max(5000),
  parentMessageId: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { recipientId, content, parentMessageId } = messageSchema.parse(body);

    if (recipientId === principal.userId) {
      throw AppError.validation("Cannot message yourself");
    }

    const message = await prisma.message.create({
      data: {
        senderId: principal.userId,
        recipientId,
        content,
        parentMessageId: parentMessageId || null,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const conversationWith = request.nextUrl.searchParams.get("with");

    if (!conversationWith) {
      throw AppError.validation("Conversation partner ID required");
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: principal.userId, recipientId: conversationWith },
          { senderId: conversationWith, recipientId: principal.userId },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    await prisma.message.updateMany({
      where: {
        recipientId: principal.userId,
        senderId: conversationWith,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        from: m.senderId,
        to: m.recipientId,
        content: m.content,
        createdAt: m.createdAt,
        readAt: m.readAt,
        parentMessageId: m.parentMessageId,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const messageId = request.nextUrl.searchParams.get("id");

    if (!messageId) {
      throw AppError.validation("Message ID required");
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
