import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { apkBinnenDagen, controleerPeriode, dubbeleBoekingen, filterRitten, huidigeWeek, isStatus, ritDag, totalenOver, VOERTUIG_ID } from "@/lib/ritten/model";
import { leesChauffeurs, leesVoertuigen, lijstRitten, nieuweRit } from "@/lib/ritten/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/ritten/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const geenCache = { "cache-control": "no-store" };

/**
 * GET /api/werkgever/ritten?van=JJJJ-MM-DD&tot=JJJJ-MM-DD&status=&voertuig=&chauffeur=: de ritten van een periode (hooguit
 * 31 dagen, standaard deze week) met het filter, de dubbele-boekingswaarschuwingen per rit, de totalen van de periode
 * (zonder filter), de voertuigen, de chauffeurs en de APK-meldingen (binnen 30 dagen).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const q = new URL(request.url).searchParams;
    const week = huidigeWeek(new Date());
    const p = controleerPeriode(q.get("van") ?? week.van, q.get("tot") ?? week.tot);
    if (!p.ok) throw AppError.validation(p.fout);
    const status = q.get("status") ?? "";
    if (status && !isStatus(status)) throw AppError.validation("Kies een status uit de lijst.");
    const voertuig = q.get("voertuig") ?? "";
    if (voertuig && !VOERTUIG_ID.test(voertuig)) throw AppError.validation("Dit voertuig bestaat niet.");
    const [alle, voertuigen, chauffeurs] = await Promise.all([lijstRitten(tenantId), leesVoertuigen(tenantId), leesChauffeurs(tenantId)]);
    const nu = new Date();
    const totalen = totalenOver(alle, p.waarde.van, p.waarde.tot);
    const inPeriode = alle.filter((r) => ritDag(r) >= p.waarde.van && ritDag(r) <= p.waarde.tot);
    const ritten = filterRitten(inPeriode, { ...(status && isStatus(status) ? { status } : {}), voertuigId: voertuig, chauffeur: q.get("chauffeur") ?? "" });
    const alleWaarschuwingen = dubbeleBoekingen(alle, voertuigen);
    const waarschuwingen = Object.fromEntries(ritten.filter((r) => alleWaarschuwingen[r.id]).map((r) => [r.id, alleWaarschuwingen[r.id]]));
    return NextResponse.json(
      { ritten, waarschuwingen, totalen: totalen.ok ? totalen.waarde : null, voertuigen, chauffeurs, apk: apkBinnenDagen(voertuigen, nu, 30), van: p.waarde.van, tot: p.waarde.tot },
      { headers: geenCache },
    );
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** POST /api/werkgever/ritten: een nieuwe rit maken (status gepland, met het eerstvolgende nummer van dit jaar). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const { rit, waarschuwingen } = await nieuweRit(tenantId, await leesJson(request), new Date());
    return NextResponse.json({ rit, waarschuwingen }, { status: 201 });
  } catch (err) {
    return foutAntwoord(err);
  }
}
