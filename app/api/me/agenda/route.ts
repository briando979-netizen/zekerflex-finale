import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { addManualItem, listAgendaItems } from "@/lib/agenda/store";
import { employerShiftsBetween } from "@/lib/agenda/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60_000;

// GET /api/me/agenda?from=&to=&shifts=1 — appointments (and for employers their shifts) in a window.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const url = new URL(request.url);
    const from = new Date(url.searchParams.get("from") ?? Date.now() - DAY);
    const to = new Date(url.searchParams.get("to") ?? Date.now() + 60 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() - from.getTime() > 400 * DAY) {
      throw AppError.validation("Ongeldige periode");
    }
    const [items, shifts] = await Promise.all([
      listAgendaItems(p.userId, from, to),
      url.searchParams.get("shifts") === "1" ? employerShiftsBetween(p, from, to) : Promise.resolve([]),
    ]);
    return NextResponse.json({ items, shifts });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }).nullable().optional(),
    allDay: z.boolean().optional().default(false),
    location: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => !v.end || new Date(v.end) > new Date(v.start), { message: "Einde ligt voor het begin", path: ["end"] });

// POST /api/me/agenda — add an appointment yourself.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = createSchema.parse(await request.json().catch(() => ({})));
    const item = await addManualItem(p.userId, {
      title: input.title,
      start: new Date(input.start).toISOString(),
      end: input.end ? new Date(input.end).toISOString() : null,
      allDay: input.allDay,
      location: input.location || null,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
