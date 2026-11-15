import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { eisBeheer } from "@/lib/horeca/toegang";
import { loonstrokenVan, verwijderLoonstrook, voegLoonstrookToe } from "@/lib/horeca-personeel/loonstroken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De loonstroken van het personeel (lib/horeca-personeel/loonstroken.ts), voor de beheerder van de zaak: lijst, een pdf
// toevoegen (multipart) en verwijderen. Het downloaden staat in ./[id]/route.ts.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eisBeheer();
    const medewerkerId = new URL(request.url).searchParams.get("medewerker") ?? undefined;
    return NextResponse.json({ loonstroken: await loonstrokenVan(tenantId, medewerkerId) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { p, tenantId } = await eisBeheer();
    await enforceRateLimit({ name: "horeca-loonstroken", identifier: tenantId, limit: 120, windowSeconds: 3600 });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    const medewerkerId = String(form.get("medewerkerId") ?? "");
    const periode = String(form.get("periode") ?? "");
    if (!(file instanceof File)) throw AppError.validation("Kies een pdf-bestand.");
    if (!medewerkerId) throw AppError.validation("Kies een medewerker.");
    const l = await voegLoonstrookToe(tenantId, { medewerkerId, periode, bestandsnaam: file.name, bytes: Buffer.from(await file.arrayBuffer()), door: p.userId });
    await recordAudit({
      category: "COMPANY",
      action: "horeca.loonstrook.toegevoegd",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `${p.email} zette een loonstrook (${l.periode}) klaar voor een medewerker`,
      targetType: "horecaLoonstrook",
      targetId: l.id,
      metadata: { tenantId, medewerkerId },
    });
    return NextResponse.json({ loonstroken: await loonstrokenVan(tenantId, medewerkerId) }, { status: 201 });
  } catch (err) {
    return fout(err);
  }
}

const weg = z.object({ id: z.string().min(1).max(40), medewerkerId: z.string().min(1).max(40) });

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { tenantId } = await eisBeheer();
    const parsed = weg.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    await verwijderLoonstrook(tenantId, parsed.data.id);
    return NextResponse.json({ loonstroken: await loonstrokenVan(tenantId, parsed.data.medewerkerId) });
  } catch (err) {
    return fout(err);
  }
}
