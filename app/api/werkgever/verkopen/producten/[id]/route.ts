import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { verkoperProductDto, verwijderVerkoperProduct, wijzigVerkoperProduct, type ProductWijziging } from "@/lib/shop/verkoper";
import { wijzigProductSchema } from "@/lib/shop/verkoper-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/werkgever/verkopen/producten/<id> — prijs en voorraad meteen; naam,
// tekst, categorie of foto gaan opnieuw langs de beheerder. { pauze } haalt het
// product tijdelijk uit de shop of zet het terug.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "verkoper-product", identifier: p.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan met wijzigen; probeer het zo opnieuw." });
    const tenantId = await siteTenantOf(p);
    const parsed = wijzigProductSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer de gegevens van het product.");
    const d = parsed.data;
    const w: ProductWijziging = {};
    if (d.naam !== undefined) w.naam = d.naam;
    if (d.omschrijving !== undefined) w.omschrijving = d.omschrijving;
    if (d.categorie !== undefined) w.categorie = d.categorie;
    if (d.prijsCents !== undefined) w.prijsCents = d.prijsCents;
    if (d.fotoUploadId !== undefined) w.fotoUploadId = d.fotoUploadId;
    if (d.voorraad !== undefined) w.voorraad = d.voorraad;
    if (d.pauze !== undefined) w.pauze = d.pauze;
    const product = await wijzigVerkoperProduct(tenantId, id, w);
    return NextResponse.json({ product: verkoperProductDto(product) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/werkgever/verkopen/producten/<id> — het product helemaal weghalen.
// Eerdere bestellingen houden hun eigen kopie van naam en prijs.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    await verwijderVerkoperProduct(tenantId, id);
    await recordAudit({
      category: "ADMIN",
      action: "shop.verkoper.product-weg",
      actorUserId: p.userId,
      summary: "Verkopersproduct uit de shop gehaald",
      targetType: "shop-product",
      targetId: id,
      metadata: { tenantId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
