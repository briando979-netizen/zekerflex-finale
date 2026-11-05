import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { spoedUitVoor, zetSpoedUit } from "@/lib/spoed/oproep";

// Sms/WhatsApp bij spoedoproepen aan of uit voor de ingelogde kracht (lib/spoed).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ uit: await spoedUitVoor(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const parsed = z.object({ uit: z.boolean() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Controleer de gegevens");
    await zetSpoedUit(p.userId, parsed.data.uit);
    return NextResponse.json({ uit: parsed.data.uit });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
