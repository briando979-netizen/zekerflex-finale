import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAuth } from "@/lib/auth/handlers";
import { normaliseerKvk } from "@/lib/sales-partners/model";
import { isSalesPartner, registreerBedrijf } from "@/lib/sales-partners/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/partner/bedrijven: een sales partner registreert een bedrijf (lib/sales-partners). Alleen voor wie het beheer
// sales partner maakte; anderen krijgen 404 (geen 403: CrowdSec telt reeksen 403's). Het antwoord is de hele lijst van
// de server, die het scherm overneemt.
const invoer = z.object({
  bedrijfsnaam: z.string().trim().min(2).max(120),
  kvk: z.string().trim().max(20).optional(),
  contactnaam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
  model: z.enum(["A", "B"]),
});

export const POST = withAuth(async (request, { principal }) => {
  if (!(await isSalesPartner(principal.userId))) throw AppError.notFound("Het partnerdashboard is alleen voor sales partners.");
  const data = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  const kvk = normaliseerKvk(data.kvk);
  if (data.kvk && data.kvk.replace(/\D/g, "") !== "" && !kvk) throw AppError.validation("Een KvK-nummer heeft 8 cijfers. Laat het veld leeg als je het niet weet.");
  const bedrijven = await registreerBedrijf(principal.userId, {
    bedrijfsnaam: data.bedrijfsnaam,
    kvk,
    contactnaam: data.contactnaam,
    email: data.email,
    telefoon: data.telefoon,
    model: data.model,
  });
  return NextResponse.json({ bedrijven });
});
