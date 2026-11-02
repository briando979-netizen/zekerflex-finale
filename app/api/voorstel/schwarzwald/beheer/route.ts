import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { getPrincipal, hasRole } from "@/lib/auth";
import { alleBoekingen, zetStatus } from "@/lib/voorstel/schwarzwald-boekingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheerkant van de Schwarzwald-voorstelagenda: alle boekingen zien en
// bevestigen of annuleren. Alleen platformbeheerders (de middleware eist al een
// sessie; deze route is níet openbaar zoals .../agenda).

async function eisBeheerder() {
  const p = await getPrincipal();
  if (!p || !hasRole(p, "PLATFORM_ADMIN")) throw AppError.forbidden("Alleen voor beheerders.");
}

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const boekingen = (await alleBoekingen()).sort((a, b) => `${a.datum} ${a.tijd}`.localeCompare(`${b.datum} ${b.tijd}`));
    return NextResponse.json({ boekingen });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  datum: z.string().max(10),
  id: z.string().max(8),
  status: z.enum(["nieuw", "bevestigd", "geannuleerd"]),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    const boeking = await zetStatus(parsed.data.datum, parsed.data.id, parsed.data.status);
    return NextResponse.json({ boeking });
  } catch (err) {
    return jsonError(err);
  }
}
