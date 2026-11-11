import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { controleerInhoud, naarBeheer, standaardGeldigTot } from "@/lib/offertes/model";
import { lijstOffertes, maakOfferte } from "@/lib/offertes/store";
import { eigenOrganisatie, leesJson } from "@/lib/offertes/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/werkgever/offertes: alle offertes van het bedrijf, de nieuwste eerst (status op de datum van vandaag). */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const nu = new Date();
    const lijst = await lijstOffertes(tenantId);
    return NextResponse.json({ offertes: lijst.map((o) => naarBeheer(o, nu)), vandaag: amsterdamDayKey(nu), standaardGeldigTot: standaardGeldigTot(nu) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** POST /api/werkgever/offertes: een nieuwe offerte (concept) met het eerstvolgende nummer van dit jaar. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "offertes-maken", identifier: userId, limit: 200, windowSeconds: 3600 });
    const nu = new Date();
    const r = controleerInhoud(await leesJson(request), nu);
    if (!r.ok) throw AppError.validation(r.fout);
    const o = await maakOfferte(tenantId, r.waarde, nu);
    await recordAudit({ category: "COMPANY", action: "offerte.gemaakt", actorUserId: userId, actorLabel: "user", summary: `Offerte ${o.nummer} gemaakt`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ offerte: naarBeheer(o, nu) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
