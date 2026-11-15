import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { eisBeheer } from "@/lib/horeca/toegang";
import { documentenVan, verwijderDocument, voegDocumentToe } from "@/lib/horeca-personeel/documenten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De documenten voor het personeel (lib/horeca-personeel/documenten.ts), voor de beheerder van de zaak: lijst, een pdf toevoegen
// (multipart) en verwijderen. Het downloaden staat in ./[id]/route.ts.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eisBeheer();
    return NextResponse.json({ documenten: await documentenVan(tenantId) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { p, tenantId } = await eisBeheer();
    await enforceRateLimit({ name: "horeca-documenten", identifier: tenantId, limit: 120, windowSeconds: 3600 });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Kies een pdf-bestand.");
    const voor = String(form.get("medewerkerId") ?? "");
    const d = await voegDocumentToe(tenantId, {
      medewerkerId: voor === "" ? null : voor,
      soort: String(form.get("soort") ?? "overig"),
      titel: String(form.get("titel") ?? ""),
      bestandsnaam: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      door: p.userId,
    });
    await recordAudit({
      category: "COMPANY",
      action: "horeca.document.toegevoegd",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `${p.email} zette een document (${d.soort}) klaar voor het personeel`,
      targetType: "horecaDocument",
      targetId: d.id,
      metadata: { tenantId, voorIedereen: d.medewerkerId === null },
    });
    return NextResponse.json({ documenten: await documentenVan(tenantId) }, { status: 201 });
  } catch (err) {
    return fout(err);
  }
}

const weg = z.object({ id: z.string().min(1).max(40) });

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { tenantId } = await eisBeheer();
    const parsed = weg.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    await verwijderDocument(tenantId, parsed.data.id);
    return NextResponse.json({ documenten: await documentenVan(tenantId) });
  } catch (err) {
    return fout(err);
  }
}
