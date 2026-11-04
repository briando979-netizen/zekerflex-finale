import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { bestellingenVan, bundelOver, koppelBestelling, startBestelling, terugPad } from "@/lib/domeinen/bestelling";
import { domeinenOpWebsite } from "@/lib/domeinen/koppelen";
import { verlengStanden, zetAutoVerlengen } from "@/lib/domeinen/verlengen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Domeinnamen van het eigen bedrijf: GET de bestellingen (en of ze op de website
// staan, tot wanneer ze lopen, of ze automatisch verlengen, een open
// verlengfactuur, en of het eerste jaar nog inbegrepen is: bundel), POST een
// nieuwe (Stripe Checkout, of meteen klaar in de bundel), { koppel: id } om een
// vastgelegde naam op de eigen website te zetten, of { verlengen: id, aan }.
// lib/domeinen/bestelling.ts en verlengen.ts.

async function bedrijf() {
  const p = await getPrincipal();
  if (!p) throw AppError.unauthenticated();
  requireRole(p, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
  const tenantId = (await resolveEmployerScope(p)).tenantIds[0];
  if (!tenantId) throw AppError.validation("Geen organisatie gekoppeld aan je account.");
  return { tenantId, userId: p.userId, email: p.email, naam: p.fullName };
}

async function lijst(tenantId: string) {
  const [bestellingen, op, standen] = await Promise.all([bestellingenVan(tenantId), domeinenOpWebsite(tenantId), verlengStanden(tenantId)]);
  return bestellingen.map((b) => ({ ...b, opWebsite: op.includes(b.domein), ...(standen.get(b.id) ?? {}) }));
}

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function GET(): Promise<NextResponse> {
  try {
    const b = await bedrijf();
    const [bestellingen, bundel] = await Promise.all([lijst(b.tenantId), bundelOver(b.tenantId)]);
    return NextResponse.json({ bestellingen, bundel }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return fout(err);
  }
}

const schema = z.object({ domein: z.string().trim().min(3).max(260), terug: z.string().max(80).optional() });
const koppelSchema = z.object({ koppel: z.string().min(1).max(60) });
const verlengSchema = z.object({ verlengen: z.string().min(1).max(60), aan: z.boolean() });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const b = await bedrijf();
    const body: unknown = await request.json().catch(() => null);
    const verlengen = verlengSchema.safeParse(body);
    if (verlengen.success) {
      await zetAutoVerlengen(b.tenantId, verlengen.data.verlengen, verlengen.data.aan);
      return NextResponse.json({ bestellingen: await lijst(b.tenantId) });
    }
    const koppel = koppelSchema.safeParse(body);
    if (koppel.success) {
      await koppelBestelling(b.tenantId, koppel.data.koppel, { userId: b.userId, name: b.naam });
      return NextResponse.json({ bestellingen: await lijst(b.tenantId) });
    }
    await enforceRateLimit({ name: "domeinen-bestellen", identifier: b.userId, limit: 10, windowSeconds: 3600, message: "Je hebt veel bestellingen gestart. Probeer het over een uur opnieuw." });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw AppError.validation("Kies een domeinnaam.");
    const basis = env.APP_BASE_URL.replace(/\/+$/, "");
    // terug: alleen een vaste eigen pagina (terugPad in lib/domeinen/bestelling.ts)
    return NextResponse.json(await startBestelling(b, parsed.data.domein, (pad) => `${basis}${pad}`, terugPad(parsed.data.terug)));
  } catch (err) {
    return fout(err);
  }
}
