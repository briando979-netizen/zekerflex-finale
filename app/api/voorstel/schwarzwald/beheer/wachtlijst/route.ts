import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { alleWachtplekken, haalVanWachtlijst } from "@/lib/voorstel/schwarzwald-wachtlijst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Wachtlijst in het beheer: wie wacht er op welk tijdslot, en is daar
// inmiddels weer plek (dan kan het team bellen). Van de lijst halen kan ook.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ wachtlijst: await alleWachtplekken() });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = z.object({ id: z.string().max(40) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende wachtlijstplek.");
    await haalVanWachtlijst(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
