import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { alleIndoor, verwijderIndoor } from "@/lib/voorstel/schwarzwald-indoor";
import { indoorExport, telPerInteresse } from "@/lib/voorstel/indoor-regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Interesselijst voor het indoor megacenter in het beheer: wie wil het weten,
// waarvoor, en een export voor Excel (?formaat=csv) om bij de opening te
// mailen. Verwijderen kan per aanmelding.

const csvVeld = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const lijst = (await alleIndoor()).map((a) => ({ ...a, dag: amsterdamDayKey(a.aangemeld) }));
    if (new URL(request.url).searchParams.get("formaat") === "csv") {
      const regels = indoorExport(lijst).map((r) => r.map(csvVeld).join(";"));
      return new NextResponse(`﻿${regels.join("\r\n")}`, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="schwarzwald-indoor-interesse.csv"' },
      });
    }
    return NextResponse.json({ aanmeldingen: lijst, perInteresse: telPerInteresse(lijst) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = z.object({ id: z.string().max(40) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende aanmelding.");
    await verwijderIndoor(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
