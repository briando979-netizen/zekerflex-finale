import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { isBelgischeKlus, isContractSjabloon, SJABLONEN_PER_SOORT } from "@/lib/belgie/klus-kern";
import { leesBelgieKlusVoor } from "@/lib/belgie/klus";
import { contractBestandsnaam, contractTekst } from "@/lib/belgie/contracten";
import { plaatsRegel } from "@/lib/geo/vestiging-land";
import { amsterdamClock, amsterdamDagLabel, amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/diensten/<klus>/belgie/contract?sjabloon=student[&werker=<userId>]
// Een contractsjabloon voor een klus in België (lib/belgie/contracten.ts) als tekstbestand, met de gegevens van de klus al
// ingevuld, en de naam van een gekozen werker als het bedrijf die meegeeft. Alleen voor het bedrijf van de klus; alleen een werker
// die bij deze klus is ingepland (anders blijven zijn regels leeg). Nooit een rijksregisternummer.
export async function GET(request: Request, props: { params: Promise<{ shiftId: string }> }): Promise<Response> {
  try {
    const { shiftId } = await props.params;
    const url = new URL(request.url);
    const sjabloon = url.searchParams.get("sjabloon");
    const werkerId = url.searchParams.get("werker");
    if (!isContractSjabloon(sjabloon)) throw AppError.validation("Kies een sjabloon.");

    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
    const shift = await prisma.shift.findFirst({
      where: { AND: [{ id: shiftId }, { branch: scopeWhere }] },
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        breakMinutes: true,
        hourlyRateCents: true,
        branch: { select: { addressLine: true, postalCode: true, city: true, tenant: { select: { name: true, vatNumber: true } } } },
        assignments: { where: { cancelledAt: null }, select: { freelancer: { select: { userId: true, user: { select: { fullName: true } } } } } },
      },
    });
    if (!shift || !isBelgischeKlus(shift.branch.postalCode)) throw AppError.notFound("Deze klus in België bestaat niet.");
    const klus = await leesBelgieKlusVoor(shift.id);
    if (!klus.soort || !(SJABLONEN_PER_SOORT[klus.soort] as readonly string[]).includes(sjabloon)) {
      throw AppError.notFound("Dit sjabloon hoort niet bij het soort contract van deze klus.");
    }
    const werker = werkerId ? shift.assignments.find((a) => a.freelancer.userId === werkerId)?.freelancer.user.fullName ?? null : null;

    const uren = Math.max(0, (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000 - shift.breakMinutes / 60);
    const adres = shift.branch.addressLine.trim();
    const plaats = plaatsRegel({ postalCode: shift.branch.postalCode, city: shift.branch.city }, "nl");
    const tekst = contractTekst(sjabloon, {
      bedrijf: { naam: shift.branch.tenant.name, btwNummer: shift.branch.tenant.vatNumber },
      werker: werker ? { naam: werker } : null,
      klus: {
        titel: shift.title,
        omschrijving: shift.description,
        werkplek: adres && !plaats.includes(adres) ? `${adres}, ${plaats}` : plaats || adres,
        datum: `${amsterdamDagLabel(amsterdamDayKey(shift.startsAt))} ${amsterdamParts(shift.startsAt).year}`,
        van: amsterdamClock(shift.startsAt),
        tot: amsterdamClock(shift.endsAt),
        pauzeMinuten: shift.breakMinutes,
        uren,
        uurloonCents: shift.hourlyRateCents,
      },
    });
    // met een BOM, zodat ook een oud tekstprogramma of Word de é en de € goed leest
    return new Response(`﻿${tekst}`, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${contractBestandsnaam(sjabloon, shift.title)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return Response.json(body, { status });
  }
}
