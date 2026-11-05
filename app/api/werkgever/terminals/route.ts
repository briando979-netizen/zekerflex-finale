import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { maakTerminal, terminalRegelsVanVandaag, terminalsVan, verwijderTerminal, vernieuwSleutel, wijzigTerminal } from "@/lib/incheck/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Werkgever → Inchecken op locatie: de terminals (tablet aan de muur, NFC-sticker) per vestiging
// en de check-ins van vandaag (lib/incheck/store.ts). De sleutel van een scherm krijg je alleen
// terug bij het maken of vernieuwen; daarna staat hij nergens meer leesbaar.

async function tenantVan() {
  const p = await requirePrincipal();
  const scope = await resolveEmployerScope(p);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return tenantId;
}

export async function GET(): Promise<NextResponse> {
  try {
    const tenantId = await tenantVan();
    const [terminals, branches, vandaag] = await Promise.all([
      terminalsVan(tenantId),
      prisma.branch.findMany({ where: { tenantId, kind: "PERMANENT" }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
      terminalRegelsVanVandaag(tenantId),
    ]);
    return NextResponse.json({ terminals: terminals.map(({ sleutelHash: _h, ...t }) => t), branches, vandaag });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const nieuw = z.object({ branchId: z.string().min(1).max(64), naam: z.string().trim().min(1).max(60) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const tenantId = await tenantVan();
    const body = nieuw.parse(await request.json().catch(() => ({})));
    const { terminal, sleutel } = await maakTerminal(tenantId, body.branchId, body.naam);
    const { sleutelHash: _h, ...t } = terminal;
    return NextResponse.json({ terminal: t, sleutel }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const wijzig = z.object({ id: z.string().max(40), naam: z.string().trim().min(1).max(60).optional(), actief: z.boolean().optional(), nieuweSleutel: z.boolean().optional() });

// PATCH { id, naam?, actief?, nieuweSleutel? }
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const tenantId = await tenantVan();
    const body = wijzig.parse(await request.json().catch(() => ({})));
    if (body.nieuweSleutel) {
      const { terminal, sleutel } = await vernieuwSleutel(tenantId, body.id);
      const { sleutelHash: _h, ...t } = terminal;
      return NextResponse.json({ terminal: t, sleutel });
    }
    const terminal = await wijzigTerminal(tenantId, body.id, { naam: body.naam, actief: body.actief });
    const { sleutelHash: _h, ...t } = terminal;
    return NextResponse.json({ terminal: t });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const tenantId = await tenantVan();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    await verwijderTerminal(tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
