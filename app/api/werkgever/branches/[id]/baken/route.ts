import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { bakenInstellingen, bakenUrl, bewaarBakenInstellingen } from "@/lib/checkin/baken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  qr: z.boolean().optional(),
  automatisch: z.boolean().optional(),
  bleNaam: z.string().trim().max(40).nullable().optional(),
  nieuweQr: z.boolean().optional(),
});

async function eigenVestiging(id: string) {
  const principal = await requirePrincipal();
  requireRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const branch = await prisma.branch.findFirst({ where: { AND: [{ id }, scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } }] }, select: { id: true, name: true, tenantId: true } });
  if (!branch) throw AppError.notFound("Vestiging niet gevonden");
  return { principal, branch };
}

async function view(branchId: string) {
  const inst = await bakenInstellingen(branchId);
  return { ...inst, qrUrl: inst.qr ? bakenUrl(branchId, inst.qrVersie) : null };
}

// GET /api/werkgever/branches/:id/baken — instellingen + de link in de QR-code.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const { branch } = await eigenVestiging(id);
    return NextResponse.json(await view(branch.id));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/werkgever/branches/:id/baken — QR aan/uit, nieuwe code, Bluetooth-naam, automatisch inchecken.
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const { principal, branch } = await eigenVestiging(id);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    const d = parsed.data;
    if (d.bleNaam && !/^[A-Za-z0-9 _.-]{2,40}$/.test(d.bleNaam)) throw AppError.validation("De naam van het baken mag alleen letters, cijfers, spatie, punt, streepje of underscore bevatten.");
    await bewaarBakenInstellingen(branch.id, {
      ...(d.automatisch !== undefined ? { automatisch: d.automatisch } : {}),
      ...(d.qr !== undefined ? { qr: d.qr } : {}),
      ...(d.bleNaam !== undefined ? { bleNaam: d.bleNaam } : {}),
      ...(d.nieuweQr !== undefined ? { nieuweQr: d.nieuweQr } : {}),
    });
    await recordAudit({
      category: "COMPANY",
      action: "employer.branch.baken",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Locatiebaken van "${branch.name}" bijgewerkt`,
      targetType: "branch",
      targetId: branch.id,
      metadata: { tenantId: branch.tenantId, velden: Object.keys(d) },
    });
    return NextResponse.json(await view(branch.id));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
