import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { antwoordOpSpoed } from "@/lib/spoed/oproep";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/whatsapp/inkomend — de WhatsApp-brug (deploy/whatsapp-brug) geeft
// een binnengekomen bericht door; wij geven het antwoord terug dat de brug
// moet sturen (of null: niets sturen). Eigen gedeelde sleutel, geen sessie.

const schema = z.object({ van: z.string().min(6).max(32), tekst: z.string().max(2000) });

function sleutelKlopt(request: Request): boolean {
  const verwacht = env.WHATSAPP_BRUG_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const gegeven = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!verwacht || !gegeven) return false;
  const a = Buffer.from(verwacht);
  const b = Buffer.from(gegeven);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sleutelKlopt(request)) return NextResponse.json({ error: { message: "Niet toegestaan" } }, { status: 403 });
  const lees = await webhookTekst(request, WEBHOOK_MAX.whatsapp);
  if (!lees.ok) return lees.response;
  let ruw: unknown = null;
  try {
    ruw = JSON.parse(lees.tekst);
  } catch {
    /* geen JSON: het schema weigert het hieronder */
  }
  const parsed = schema.safeParse(ruw);
  if (!parsed.success) return NextResponse.json({ error: { message: "Controleer de gegevens" } }, { status: 422 });
  try {
    await enforceRateLimit({ name: "whatsapp-inkomend", identifier: parsed.data.van, limit: 20, windowSeconds: 600, message: "te veel berichten" });
  } catch {
    return NextResponse.json({ antwoord: null });
  }
  const antwoord = await antwoordOpSpoed(parsed.data.van, parsed.data.tekst, "whatsapp").catch(() => null);
  return NextResponse.json({ antwoord });
}
