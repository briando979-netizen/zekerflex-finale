import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { alleBerichten, slaBerichtOp, verwijderBericht } from "@/lib/voorstel/schwarzwald-nieuws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nieuwsberichten in het beheer: alles zien (ook concepten en ingeplande),
// schrijven/aanpassen (POST, met id = aanpassen) en verwijderen.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ berichten: await alleBerichten() });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  id: z.string().max(40).optional(),
  titel: z.string().trim().min(3, "Geef het bericht een titel.").max(120),
  datum: z.string().max(10),
  samenvatting: z.string().trim().max(300),
  tekst: z.string().trim().min(1, "Schrijf de tekst van het bericht.").max(10000),
  foto: z.string().max(200),
  gepubliceerd: z.boolean(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer het bericht.", parsed.error.flatten());
    const { id, ...invoer } = parsed.data;
    return NextResponse.json({ bericht: await slaBerichtOp(invoer, id) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = z.object({ id: z.string().max(40) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekend bericht.");
    await verwijderBericht(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
