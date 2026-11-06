import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { toonKenteken } from "@/lib/locatie/modules";
import { mijnVoertuig, zetMijnVoertuig } from "@/lib/locatie/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mijn kenteken (lib/locatie/toegang.ts): een werker vult het één keer in, zodat
// een slagboom met kentekenherkenning hem herkent waar hij ingepland staat.
//   GET            → { voertuig: { kenteken, weergave, sinds } | null }
//   POST { kenteken: string | null } → idem (null = weghalen)

const schema = z.object({ kenteken: z.string().max(20).nullable() });

const weergave = (v: { kenteken: string; sinds: string } | null) => (v ? { ...v, weergave: toonKenteken(v.kenteken) } : null);

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ voertuig: weergave(await mijnVoertuig(p.userId)) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(await request.json().catch(() => ({})));
    const v = await zetMijnVoertuig(p.userId, input.kenteken?.trim() ? input.kenteken : null);
    return NextResponse.json({ voertuig: weergave(v) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
