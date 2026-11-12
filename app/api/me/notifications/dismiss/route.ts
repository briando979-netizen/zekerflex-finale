import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { addDismissed, notifSignature } from "@/lib/notifications/dismissed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/notifications/dismiss { items: [{ id, body, sig? }] }
// Markeert meldingen als gelezen (server-side, over apparaten heen). `sig` is de handtekening die de melding zelf meekreeg
// (altijd uit de Nederlandse tekst, ook bij een vertaalde melding); zonder sig wordt hij uit id + body berekend.
const schema = z.object({
  items: z
    .array(z.object({ id: z.string().min(1).max(200), body: z.string().max(2000), sig: z.string().regex(/^[0-9a-f]{16}$/).optional() }))
    .min(1)
    .max(50),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { items } = schema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
      }),
    );
    await addDismissed(
      p.userId,
      items.map((i) => i.sig ?? notifSignature(i.id, i.body)),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
