import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { exportVoorMedewerker } from "@/lib/horeca-personeel/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alle eigen gegevens van de ingelogde medewerker als json-bestand (AVG: inzage en overdracht). Alleen zijn eigen gegevens.
export async function GET(): Promise<Response> {
  try {
    const c = await medewerkerContext();
    if (!c) throw AppError.unauthenticated();
    await enforceRateLimit({ name: "personeel-export", identifier: c.userId, limit: 10, windowSeconds: 3600 });
    const data = await exportVoorMedewerker(c.tenantId, c.medewerker.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="mijn-gegevens.json"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
