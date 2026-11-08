import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ticketSchema = z.object({
  subject: z.string().min(5),
  description: z.string().min(20),
  category: z.enum(["PAYMENT", "TECHNICAL", "ACCOUNT", "SHIFT", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  attachmentUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = ticketSchema.parse(body);

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: principal.userId,
        subject: data.subject,
        description: data.description,
        category: data.category,
        priority: data.priority || "MEDIUM",
        status: "OPEN",
        attachmentUrl: data.attachmentUrl,
      },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const status = request.nextUrl.searchParams.get("status");

    const tickets = await prisma.supportTicket.findMany({
      where: {
        userId: principal.userId,
        ...(status && { status }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const ticketId = request.nextUrl.searchParams.get("id");

    if (!ticketId) {
      throw AppError.validation("Ticket ID required");
    }

    const body = await request.json();
    const { status, response } = z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
        response: z.string().optional(),
      })
      .parse(body);

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        response: response || undefined,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
