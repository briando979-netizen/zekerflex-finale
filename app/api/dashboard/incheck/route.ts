import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isCode } from "@/lib/incheck/regels";
import { checkInViaTelefoon, fobsVan, ontkoppelFob, startKoppeling, standVoor, terminalVanCode } from "@/lib/incheck/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De telefoon van de kracht bij een terminal (app/dashboard/incheck): wat de
// volgende tik doet, inchecken of uitchecken, en een sleutelhanger koppelen.
//   GET  ?t=<code>              → vestiging, dienst van nu en de volgende actie
//   POST { code, k?, actie }    → "incheck" (in of uit), "koppel" (start), "ontkoppel" (hash)
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const code = new URL(request.url).searchParams.get("t") ?? "";
    const fobs = await fobsVan(p.userId);
    if (!isCode(code)) return NextResponse.json({ terminal: null, fobs });
    const t = await terminalVanCode(code);
    if (!t) return NextResponse.json({ terminal: null, fobs });
    const stand = await standVoor(p.userId, t);
    return NextResponse.json({
      terminal: { naam: t.naam, vestiging: stand.vestiging },
      dienst: stand.dienst ? { titel: stand.dienst.titel, start: stand.dienst.start.toISOString(), eind: stand.dienst.eind.toISOString(), shiftId: stand.dienst.shiftId } : null,
      actie: stand.actie,
      fobs,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("incheck"), code: z.string().max(12), k: z.string().max(12).optional() }),
  z.object({ actie: z.literal("koppel"), code: z.string().max(12) }),
  z.object({ actie: z.literal("ontkoppel"), hash: z.string().max(64) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    await enforceRateLimit({ name: "incheck-telefoon", identifier: p.userId, limit: 30, windowSeconds: 600, message: "Even wachten: te veel pogingen achter elkaar." });
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.actie === "ontkoppel") {
      await ontkoppelFob(p.userId, body.hash);
      return NextResponse.json({ fobs: await fobsVan(p.userId) });
    }
    if (!isCode(body.code)) throw AppError.notFound("Deze code is niet geldig.");
    if (body.actie === "koppel") {
      const t = await terminalVanCode(body.code);
      if (!t) throw AppError.notFound("Deze terminal bestaat niet (meer).");
      return NextResponse.json(await startKoppeling(t.id, p.userId));
    }
    const r = await checkInViaTelefoon(p.userId, body.code, body.k ?? null);
    if (!r) throw AppError.notFound("Deze terminal bestaat niet (meer).");
    return NextResponse.json(r.uitslag);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
