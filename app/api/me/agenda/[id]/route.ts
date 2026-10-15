import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { deleteAgendaItem } from "@/lib/agenda/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/me/agenda/:id — remove an appointment (an automatic one won't be re-added).
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  try {
    const p = await requirePrincipal();
    if (!(await deleteAgendaItem(p.userId, id))) throw AppError.notFound("Afspraak niet gevonden");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
