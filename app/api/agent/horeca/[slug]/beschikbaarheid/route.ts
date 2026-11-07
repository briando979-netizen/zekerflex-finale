import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { agentZaak } from "@/lib/horeca/agent-server";
import { vrijeTijden } from "@/lib/horeca/reserveringen";
import { isDatum } from "@/lib/horeca/reserveren";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voor AI-assistenten: welke tijden op een dag vrij zijn voor zoveel personen.
// ?datum=JJJJ-MM-DD&personen=2. Dezelfde rekenregels als de eigen site.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "agent-horeca-kijk", identifier: clientIp(request), limit: 300, windowSeconds: 600 });
    const zaak = await agentZaak((await params).slug);
    const q = new URL(request.url).searchParams;
    const datum = q.get("datum") ?? "";
    const personen = Number(q.get("personen") ?? "2");
    if (!isDatum(datum)) throw AppError.validation("Geef een datum als JJJJ-MM-DD, bijvoorbeeld ?datum=2026-12-24.");
    if (!Number.isInteger(personen) || personen < 1 || personen > 100) throw AppError.validation("Geef het aantal personen als heel getal van 1 tot 100.");
    const { instellingen, tijden } = await vrijeTijden(zaak, datum, personen);
    const teGroot = personen > instellingen.maxGroep;
    return NextResponse.json({
      zaak: { slug: zaak.slug, naam: zaak.naam },
      datum,
      personen,
      vrij: teGroot ? [] : tijden.filter((t) => t.vrij).map((t) => t.tijd),
      vol: teGroot ? tijden.map((t) => t.tijd) : tijden.filter((t) => !t.vrij).map((t) => t.tijd),
      ...(teGroot ? { melding: `Online kan tot ${instellingen.maxGroep} personen. Voor een grotere groep: bel ${zaak.telefoon || "de zaak"}.` } : {}),
      ...(tijden.length === 0 ? { melding: "Op deze dag is de zaak dicht of zijn er geen tijden meer over." } : {}),
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
