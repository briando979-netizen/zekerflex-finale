import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { markeerGezien, verwijderStatus } from "@/lib/messaging/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eén status (lib/messaging/status.ts):
//   POST { van } → je zag de status van `van` (alleen als je hem mag zien) → { ok }
//   DELETE       → je eigen status weg, met de foto → { ok }
// Niet voor jou of al verlopen: 404 (geen 403, AGENTS.md).

const schema = z.object({ van: z.string().min(1).max(40) });
const ID = /^[0-9a-f-]{36}$/;
const weg = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Deze status is er niet (meer)." } }, { status: 404 });

export async function POST(req: Request, props: { params: Promise<{ statusId: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { statusId } = await props.params;
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success || !ID.test(statusId)) throw AppError.validation("Onbekende status");
    if (!(await markeerGezien(p.userId, body.data.van, statusId))) return weg();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ statusId: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { statusId } = await props.params;
    if (!ID.test(statusId)) throw AppError.validation("Onbekende status");
    if (!(await verwijderStatus(p.userId, statusId))) return weg();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
