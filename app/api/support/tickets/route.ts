import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { createTicket, getTicket, updateTicketStatus } from "@/lib/support/tickets/ticket";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createTicketSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  tags: z.array(z.string()).optional(),
  attachmentUrls: z.array(z.string().url()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const ticketId = request.nextUrl.searchParams.get("id");

    if (!ticketId) {
      throw AppError.validation("Ticket ID required");
    }

    const ticket = await getTicket(principal.tenantId, ticketId);
    if (!ticket) {
      throw AppError.notFound("Ticket not found");
    }

    return NextResponse.json({ ticket });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = createTicketSchema.parse(body);

    const ticket = await createTicket({
      tenantId: principal.tenantId,
      userId: principal.userId,
      title: data.title,
      description: data.description,
      priority: data.priority || "MEDIUM",
      tags: data.tags || [],
      attachmentUrls: data.attachmentUrls || [],
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole("SUPPORT_AGENT");
    const ticketId = request.nextUrl.searchParams.get("id");
    const body = await request.json();
    const { status } = z.object({ status: z.string() }).parse(body);

    if (!ticketId) {
      throw AppError.validation("Ticket ID required");
    }

    const ticket = await updateTicketStatus(principal.tenantId, ticketId, status);

    return NextResponse.json({ ticket });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
