import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { voorraadCsv } from "@/lib/voorraad/model";
import { leesArtikelen } from "@/lib/voorraad/store";
import { eigenOrganisatie } from "@/lib/voorraad/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/werkgever/voorraad/export: de voorraad als CSV-bijlage (`;`-gescheiden, UTF-8 met BOM, voor Excel). */
export async function GET(): Promise<Response> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const csv = voorraadCsv(await leesArtikelen(tenantId));
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="voorraad-${amsterdamDayKey(new Date())}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
