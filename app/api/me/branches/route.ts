import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { getBrancheKeuze, setBrancheKeuze } from "@/lib/worker/branche-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  alle: z.boolean().optional(),
  branches: z.array(z.string().max(30)).max(40).optional(),
});

/** GET /api/me/branches: de gekozen branches, of null als er nog geen keuze is. */
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    return NextResponse.json({ keuze: await getBrancheKeuze(principal.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/me/branches  { alle?: boolean, branches?: string[] }
 * Eén of meer branches, of alle branches. Onbekende branches vallen weg; niets gekozen is een fout.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const json = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Kies minstens één branche, of alle branches.");
    const keuze = await setBrancheKeuze(principal.userId, parsed.data);
    if (!keuze) throw AppError.validation("Kies minstens één branche, of alle branches.");
    return NextResponse.json({ keuze });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
