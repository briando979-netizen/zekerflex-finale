import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { normaliseerKvk } from "@/lib/sales-partners/model";
import { beheerBedrijf, type BeheerActie } from "@/lib/sales-partners/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/sales-partners/bedrijf: een registratie van een sales partner goedkeuren door hem te koppelen aan een
// bedrijfsaccount (op KvK-nummer of bedrijfs-id), ontkoppelen, afwijzen of terugzetten. Pas na het koppelen tellen
// de uren van dat bedrijf mee voor de commissie. Strikt platformbeheer, met een regel in de audit.
const invoer = z.object({
  partnerId: z.string().trim().min(1).max(64),
  bedrijfId: z.string().trim().min(1).max(64),
  actie: z.enum(["koppel", "ontkoppel", "afwijzen", "herstel"]),
  tenant: z.string().trim().max(64).optional(),
  reden: z.string().trim().max(300).optional(),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  let actie: BeheerActie;
  if (input.actie === "koppel") {
    const zoek = input.tenant ?? "";
    if (!zoek) throw AppError.validation("Vul het KvK-nummer of de bedrijfs-id van het bedrijfsaccount in.");
    const kvk = normaliseerKvk(zoek);
    const tenant = await prisma.tenant.findFirst({
      where: kvk ? { OR: [{ kvkNumber: kvk }, { id: zoek }] } : { id: zoek },
      select: { id: true, name: true, type: true },
    });
    if (!tenant) throw AppError.notFound("Geen bedrijfsaccount gevonden met dit KvK-nummer of deze id.");
    if (tenant.type === "PLATFORM") throw AppError.validation("ZekerFlex zelf kan geen klant van een partner zijn.");
    actie = { soort: "koppel", tenantId: tenant.id, tenantNaam: tenant.name };
  } else if (input.actie === "afwijzen") {
    actie = { soort: "afwijzen", reden: input.reden ?? "" };
  } else {
    actie = { soort: input.actie };
  }
  const bedrijf = await beheerBedrijf(input.partnerId, input.bedrijfId, actie, { userId: principal.userId });
  return NextResponse.json({ bedrijf });
});
