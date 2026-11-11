import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { DAG_SLEUTEL, MAX_DAGEN, SJABLOON_ID, UITVOERING_ID, controleerUitvoering, plusDagen } from "@/lib/checklists/model";
import { leesSjabloon, leggVast, uitvoeringenTussen } from "@/lib/checklists/store";
import { eigenOrganisatie, foutAntwoord, leesJson } from "@/lib/checklists/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/werkgever/checklists/uitvoeringen?sjabloon=<id>&tot=YYYY-MM-DD: de geschiedenis van uitvoeringen, de nieuwste
 * eerst. Een periode van 31 dagen eindigend op `tot` (standaard vandaag); met `sjabloon` alleen die checklist.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const q = new URL(request.url).searchParams;
    const vandaag = amsterdamDayKey(new Date());
    const tot = DAG_SLEUTEL.test(q.get("tot") ?? "") ? (q.get("tot") as string) : vandaag;
    const van = plusDagen(tot, -(MAX_DAGEN - 1));
    const sjabloonId = q.get("sjabloon");
    if (sjabloonId !== null && !SJABLOON_ID.test(sjabloonId)) throw AppError.notFound("Deze checklist bestaat niet (meer).");
    const lijst = (await uitvoeringenTussen(tenantId, van, tot)).filter((u) => sjabloonId === null || u.sjabloonId === sjabloonId);
    return NextResponse.json({ van, tot, uitvoeringen: lijst.sort((a, b) => b.tijdstip.localeCompare(a.tijdstip)) });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/**
 * POST /api/werkgever/checklists/uitvoeringen: zelf een checklist invullen, of een eerdere uitvoering corrigeren
 * (`correctieVan`). Een uitvoering wordt nooit aangepast: een correctie is een nieuwe uitvoering met een verwijzing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "checklists-beheer-uitvoering", identifier: userId, limit: 300, windowSeconds: 3600 });
    const o = await leesJson(request);
    const sjabloonId = typeof o.sjabloonId === "string" ? o.sjabloonId : "";
    const s = SJABLOON_ID.test(sjabloonId) ? await leesSjabloon(tenantId, sjabloonId) : null;
    if (!s) throw AppError.notFound("Deze checklist bestaat niet (meer).");
    const correctieVan = typeof o.correctieVan === "string" && o.correctieVan ? o.correctieVan : undefined;
    if (correctieVan !== undefined && !UITVOERING_ID.test(correctieVan)) throw AppError.notFound("De uitvoering die je wilt corrigeren bestaat niet.");
    const r = controleerUitvoering(s, o);
    if (!r.ok) throw AppError.validation(r.fout);
    const { uitvoering } = await leggVast(tenantId, s, r.waarde, { bron: "beheer", ...(correctieVan !== undefined ? { correctieVan } : {}) });
    return NextResponse.json({ uitvoering });
  } catch (err) {
    return foutAntwoord(err);
  }
}
