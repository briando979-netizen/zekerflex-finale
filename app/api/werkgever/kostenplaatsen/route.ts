import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { hernoemKostenplaatsVoor, lijstKostenplaatsen, verwijderKostenplaatsVoor, voegKostenplaatsToeVoor } from "@/lib/werkgever/kostenplaatsen";
import { KOSTENPLAATS_LENGTE, KOSTENPLAATS_MAX, type KostenplaatsFout, type KostenplaatsUitkomst } from "@/lib/werkgever/kostenplaatsen-kern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Kostenplaatsen / PO-nummers van het bedrijf (Instellingen → Kostenplaatsen; regels: lib/werkgever/kostenplaatsen-kern.ts).
//   GET     de lijst met per kostenplaats het gebruik (vestigingen en lopende klussen)
//   POST    { naam }          een kostenplaats erbij
//   PATCH   { naam, nieuw }   een andere naam (alleen als hij nergens in gebruik is)
//   DELETE  { naam }          weghalen (alleen als hij nergens in gebruik is)
// Lezen mag elke beheerder en vestigingsmanager (zij kiezen er bij het uitzetten uit); wijzigen alleen een beheerder (HQ_ADMIN), zoals
// de locaties. Elk antwoord op een wijziging is de nieuwe lijst van de server. Een fout draagt details.fout (een vaste sleutel):
// het scherm kiest daarmee zijn eigen tekst in de taal van de app, de message hier is Nederlands.
// ---------------------------------------------------------------------------

async function tenantFor() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { principal, tenantId, kanBeheren: hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") };
}

/** 423, geen 403: een gewone sessie raakt dit vaak en CrowdSec telt een reeks 403's als inbraakpoging (AGENTS.md). */
function alleenBeheerder(kanBeheren: boolean): void {
  if (!kanBeheren) throw AppError.alleenBeheerder("Alleen een beheerder van het bedrijf kan kostenplaatsen wijzigen.");
}

const MELDING: Record<KostenplaatsFout, string> = {
  leeg: "Geef de kostenplaats een naam.",
  "te-lang": `Een kostenplaats heeft hoogstens ${KOSTENPLAATS_LENGTE} tekens.`,
  dubbel: "Deze kostenplaats bestaat al.",
  vol: `Je kunt hoogstens ${KOSTENPLAATS_MAX} kostenplaatsen hebben.`,
  onbekend: "Deze kostenplaats staat niet meer in je lijst.",
  "in-gebruik": "Deze kostenplaats staat nog bij een vestiging of een lopende klus.",
};

/** Een geweigerde wijziging als fout met een vaste sleutel in details. */
function alsFout(fout: KostenplaatsFout): AppError {
  const details = { fout };
  if (fout === "leeg" || fout === "te-lang") return AppError.validation(MELDING[fout], details);
  if (fout === "onbekend") return new AppError("NOT_FOUND", MELDING[fout], 404, details);
  return new AppError("CONFLICT", MELDING[fout], 409, details);
}

const naamSchema = z.object({ naam: z.string().max(500) });
const hernoemSchema = z.object({ naam: z.string().max(500), nieuw: z.string().max(500) });

async function antwoord(tenantId: string, uitkomst: KostenplaatsUitkomst, status = 200): Promise<NextResponse> {
  if (!uitkomst.ok) throw alsFout(uitkomst.fout);
  return NextResponse.json({ kostenplaatsen: await lijstKostenplaatsen(tenantId), max: KOSTENPLAATS_MAX }, { status });
}

const logWijziging = (principalId: string, tenantId: string, action: string, summary: string, metadata: Record<string, string>) =>
  recordAudit({
    category: "COMPANY",
    action,
    actorUserId: principalId,
    actorLabel: "user",
    summary,
    targetType: "tenant",
    targetId: tenantId,
    metadata,
  }).catch(() => undefined);

export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId, kanBeheren } = await tenantFor();
    return NextResponse.json({ kostenplaatsen: await lijstKostenplaatsen(tenantId), max: KOSTENPLAATS_MAX, kanBeheren });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId, kanBeheren } = await tenantFor();
    alleenBeheerder(kanBeheren);
    const { naam } = naamSchema.parse(await request.json().catch(() => ({})));
    const uitkomst = await voegKostenplaatsToeVoor(tenantId, naam);
    if (uitkomst.ok) await logWijziging(principal.userId, tenantId, "employer.costcentre.added", `${principal.email} voegde een kostenplaats toe`, { tenantId });
    return await antwoord(tenantId, uitkomst, 201);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId, kanBeheren } = await tenantFor();
    alleenBeheerder(kanBeheren);
    const { naam, nieuw } = hernoemSchema.parse(await request.json().catch(() => ({})));
    const uitkomst = await hernoemKostenplaatsVoor(tenantId, naam, nieuw);
    if (uitkomst.ok) await logWijziging(principal.userId, tenantId, "employer.costcentre.renamed", `${principal.email} wijzigde een kostenplaats`, { tenantId });
    return await antwoord(tenantId, uitkomst);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId, kanBeheren } = await tenantFor();
    alleenBeheerder(kanBeheren);
    const { naam } = naamSchema.parse(await request.json().catch(() => ({})));
    const uitkomst = await verwijderKostenplaatsVoor(tenantId, naam);
    if (uitkomst.ok) await logWijziging(principal.userId, tenantId, "employer.costcentre.removed", `${principal.email} verwijderde een kostenplaats`, { tenantId });
    return await antwoord(tenantId, uitkomst);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
