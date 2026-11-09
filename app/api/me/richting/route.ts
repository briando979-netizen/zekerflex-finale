import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ workerKind: z.enum(["zzp", "flexwerker", "uitzendkracht"]) });

/**
 * POST /api/me/richting  { workerKind }
 *
 * De eerste stap van de werker-start: kies hoe je wilt werken. Alleen de keuze zelf wordt
 * bewaard; KVK, btw, BSN en IBAN volgen daarna bij Gegevens en identiteit (/dashboard/verificatie).
 * Een keuze die er al is, wordt hier nooit overschreven: wijzigen kan onder Fiscaal, waar de
 * gegevens die erbij horen meegaan.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const json = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Kies een van de drie richtingen.");

    const huidig = await getFiscal(principal.userId);
    if (huidig.workerKind && huidig.workerKind !== parsed.data.workerKind) {
      throw AppError.conflict("Je richting is al gekozen. Je kunt hem aanpassen onder Fiscaal.");
    }
    const bewaard = huidig.workerKind ? huidig : await setFiscal(principal.userId, { workerKind: parsed.data.workerKind });
    return NextResponse.json({ workerKind: bewaard.workerKind });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
