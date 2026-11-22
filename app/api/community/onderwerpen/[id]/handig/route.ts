import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { idUitPad } from "@/lib/community/regels";
import { uitsluitingVan, zetHandig } from "@/lib/community/store";
import { UITGESLOTEN_TEKST } from "@/lib/community/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ reactie: z.string().regex(/^[a-z0-9]{4,32}$/).nullable().default(null) });

// POST /api/community/onderwerpen/<id>/handig: "Handig" aan of uit bij het onderwerp of een reactie, één keer per account.
// Geeft het nieuwe aantal terug (de server is de bron, AGENTS.md).
export const POST = withAuth<{ id: string }>(async (request, { params, principal }) => {
  const id = idUitPad(params.id);
  if (!id) throw AppError.notFound("Dit onderwerp bestaat niet.");
  if (await uitsluitingVan(principal.userId).catch(() => null)) throw AppError.communityUitgesloten(UITGESLOTEN_TEKST);
  await enforceRateLimit({ name: "community-handig", identifier: principal.userId, limit: 60, windowSeconds: 600, message: "Even rustig aan met Handig. Probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Dit bericht bestaat niet.");
  return NextResponse.json({ ok: true, ...(await zetHandig(principal.userId, id, parsed.data.reactie)) });
});
