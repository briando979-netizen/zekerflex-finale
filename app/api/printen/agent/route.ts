import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { labelNaarEscPos } from "@/lib/locatie/escpos";
import { LABEL_FORMAAT } from "@/lib/locatie/modules";
import { openOpdrachten, tenantVanAgentToken, zetOpdrachtStatus } from "@/lib/locatie/printen";
import { locatieStand } from "@/lib/locatie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De printagent op een computer op locatie (deploy/printen) haalt hier de
// wachtrij op en meldt wat geprint is. Alleen met het agenttoken van het
// bedrijf (header x-print-token; lib/locatie/printen.ts), daarom in de lijst
// van openbare routes met eigen sleutelcontrole.
//   GET  → { ok, opdrachten: [{ id, inhoud, formaat, escpos (base64), aangemaakt }] }
//   POST { id, status: "geprint" | "mislukt", printer?, fout? } → { ok, opdracht }
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  id: z.string().min(4).max(40),
  status: z.enum(["geprint", "mislukt"]),
  printer: z.string().max(80).optional(),
  fout: z.string().max(300).optional(),
});

async function agent(request: Request): Promise<string | null> {
  await enforceRateLimit({ name: "print-agent", identifier: clientIp(request), limit: 120, windowSeconds: 60 });
  const h = request.headers.get("x-print-token");
  const auth = request.headers.get("authorization");
  const token = h?.trim() || (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  return tenantVanAgentToken(token, request.headers.get("x-printer"));
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const tenantId = await agent(request);
    if (!tenantId) return NextResponse.json({ ok: false, reden: "token-onbekend", tekst: "Dit token is niet (meer) geldig. Maak een nieuw token in Werkgever → Op locatie → Badges en labels." }, { status: 401 });
    const stand = await locatieStand(tenantId);
    if (!stand.modules.printen?.aan) return NextResponse.json({ ok: true, moduleAan: false, opdrachten: [] });
    const rol = request.headers.get("x-rol") === "80" ? 80 : 58;
    const opdrachten = (await openOpdrachten(tenantId)).map((o) => ({
      id: o.id,
      inhoud: o.inhoud,
      formaat: LABEL_FORMAAT[o.inhoud.soort],
      aangemaakt: o.aangemaakt,
      escpos: Buffer.from(labelNaarEscPos(o.inhoud, { rol, snijden: true })).toString("base64"),
    }));
    return NextResponse.json({ ok: true, moduleAan: true, opdrachten });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const tenantId = await agent(request);
    if (!tenantId) return NextResponse.json({ ok: false, reden: "token-onbekend" }, { status: 401 });
    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, reden: "ongeldig", tekst: "Stuur { id, status }." }, { status: 400 });
    const opdracht = await zetOpdrachtStatus(tenantId, parsed.data.id, parsed.data.status, { printer: parsed.data.printer, fout: parsed.data.fout });
    return NextResponse.json({ ok: true, opdracht });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
