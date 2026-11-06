import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { featureEnabled } from "@/lib/flags";
import { haalSignalen, kanaalGesprek, kanaalToegang, leden, meldAanwezig, meldWeg, spreker, stuurSignaal, zetSpreker } from "@/lib/locatie/portofoon";
import { locatieStand } from "@/lib/locatie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Eén portofoonkanaal (lib/locatie/portofoon.ts). De spraak gaat rechtstreeks
// tussen de telefoons; hier alleen wie-is-er en de verbindingsberichten.
//   POST { type: "join", apparaat? }                      → { kanaal, rol, leden, threadId, spreker, ik }
//   POST { type: "poll" }                                 → { leden, signalen, spreker }   (elke seconde, vernieuwt ook je aanwezigheid)
//   POST { type: "signal", to, soort, data }              → { ok }
//   POST { type: "spreek", praat }                        → { ok }
//   POST { type: "leave" }                                → { ok }
// ---------------------------------------------------------------------------

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), apparaat: z.string().max(40).optional() }),
  z.object({ type: z.literal("poll") }),
  z.object({ type: z.literal("signal"), to: z.string().min(1).max(64), soort: z.enum(["offer", "answer", "candidate"]), data: z.unknown() }),
  z.object({ type: z.literal("spreek"), praat: z.boolean() }),
  z.object({ type: z.literal("leave") }),
]);

export async function POST(request: Request, props: { params: Promise<{ kanaal: string }> }): Promise<NextResponse> {
  try {
    const { kanaal: id } = await props.params;
    const p = await requirePrincipal();
    if (!(await featureEnabled("locatie-modules", { userId: p.userId }))) throw AppError.forbidden("De portofoon staat op dit moment uit.");
    const body = schema.parse(await request.json().catch(() => ({})));
    const { kanaal, rol } = await kanaalToegang(p, id);
    if (!(await locatieStand(kanaal.tenantId)).modules.portofoon?.aan) throw AppError.forbidden("Dit bedrijf heeft de portofoon niet aanstaan.");

    if (body.type === "join") {
      const aanwezig = await meldAanwezig(kanaal.id, { userId: p.userId, naam: p.fullName, rol, ...(body.apparaat ? { apparaat: body.apparaat } : {}) });
      const owner = aanwezig.find((l) => l.rol === "team")?.userId ?? p.userId;
      const thread = await kanaalGesprek(kanaal, owner, aanwezig.map((l) => l.userId));
      return NextResponse.json({ kanaal, rol, leden: aanwezig, threadId: thread.id, spreker: await spreker(kanaal.id), ik: { userId: p.userId, naam: p.fullName } });
    }
    if (body.type === "poll") {
      const [aanwezig, signalen, wie] = await Promise.all([
        meldAanwezig(kanaal.id, { userId: p.userId, naam: p.fullName, rol }),
        haalSignalen(kanaal.id, p.userId),
        spreker(kanaal.id),
      ]);
      return NextResponse.json({ leden: aanwezig, signalen, spreker: wie });
    }
    if (body.type === "signal") {
      const aanwezig = await leden(kanaal.id);
      if (!aanwezig.some((l) => l.userId === body.to)) return NextResponse.json({ ok: false, reden: "weg" });
      await stuurSignaal(kanaal.id, { from: p.userId, to: body.to, type: body.soort, data: body.data ?? null });
      return NextResponse.json({ ok: true });
    }
    if (body.type === "spreek") {
      await zetSpreker(kanaal.id, p.userId, body.praat);
      return NextResponse.json({ ok: true });
    }
    // leave: de anderen horen het meteen, zodat hun verbinding netjes sluit
    const aanwezig = await leden(kanaal.id);
    await Promise.all(aanwezig.filter((l) => l.userId !== p.userId).map((l) => stuurSignaal(kanaal.id, { from: p.userId, to: l.userId, type: "leave", data: null })));
    await meldWeg(kanaal.id, p.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
