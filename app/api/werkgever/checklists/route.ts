import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { DAG_SLEUTEL, MAX_DAGEN, controleerSjabloon, plusDagen } from "@/lib/checklists/model";
import { maakOverzicht, maakSjabloon, nieuwTaakId } from "@/lib/checklists/store";
import { eigenOrganisatie, foutAntwoord, leesJson, voorBeheer } from "@/lib/checklists/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/werkgever/checklists?van=YYYY-MM-DD&tot=YYYY-MM-DD: de checklists, het overzicht van de periode (standaard de
 * laatste 7 dagen, hooguit 31) en de uitvoeringen erin. Het overzicht rekent in Nederlandse dagen en tijdvensters.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const q = new URL(request.url).searchParams;
    const nu = new Date();
    const vandaag = amsterdamDayKey(nu);
    const tot0 = DAG_SLEUTEL.test(q.get("tot") ?? "") ? (q.get("tot") as string) : vandaag;
    let van = DAG_SLEUTEL.test(q.get("van") ?? "") ? (q.get("van") as string) : plusDagen(tot0, -6);
    let tot = tot0;
    if (van > tot) van = tot;
    if (tot > plusDagen(van, MAX_DAGEN - 1)) tot = plusDagen(van, MAX_DAGEN - 1);
    const { overzicht, sjablonen, uitvoeringen } = await maakOverzicht(tenantId, van, tot, nu);
    return NextResponse.json({
      vandaag,
      van,
      tot,
      sjablonen: sjablonen.map(voorBeheer),
      overzicht,
      uitvoeringen: uitvoeringen.filter((u) => u.id.slice(0, 10) <= tot).sort((a, b) => b.tijdstip.localeCompare(a.tijdstip)),
    });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** POST /api/werkgever/checklists: een nieuwe checklist (sjabloon) maken. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "checklists-sjabloon", identifier: userId, limit: 120, windowSeconds: 3600, message: "Je hebt vaak checklists aangepast. Probeer het over een uur opnieuw." });
    const r = controleerSjabloon(await leesJson(request), nieuwTaakId);
    if (!r.ok) throw AppError.validation(r.fout);
    const s = await maakSjabloon(tenantId, r.waarde);
    await recordAudit({ category: "COMPANY", action: "checklists.sjabloon", actorUserId: userId, actorLabel: "user", summary: "Checklist gemaakt", targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ sjabloon: voorBeheer(s) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
