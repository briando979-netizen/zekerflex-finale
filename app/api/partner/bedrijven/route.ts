import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAuth } from "@/lib/auth/handlers";
import { getLocale } from "@/lib/i18n/server";
import { normaliseerKvk } from "@/lib/sales-partners/model";
import { isSalesPartner, registreerBedrijf } from "@/lib/sales-partners/store";
import { PARTNER_TEKSTEN, partnerTaal } from "@/lib/sales-partners/teksten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/partner/bedrijven: een sales partner registreert een bedrijf (lib/sales-partners). Alleen voor wie het beheer
// sales partner maakte; anderen krijgen 404 (geen 403: CrowdSec telt reeksen 403's). Het antwoord is de hele lijst van
// de server, die het scherm overneemt. Meldingen in de taal van het dashboard (Nederlands of Engels).
const invoer = z.object({
  bedrijfsnaam: z.string().trim().min(2).max(120),
  kvk: z.string().trim().max(20).optional(),
  contactnaam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
  model: z.enum(["A", "B"]),
});

export const POST = withAuth(async (request, { principal }) => {
  const tx = PARTNER_TEKSTEN[partnerTaal(await getLocale())];
  if (!(await isSalesPartner(principal.userId))) throw AppError.notFound(tx.fout.geenPartner);
  const data = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation(tx.fout.verzoek);
    }),
  );
  const kvk = normaliseerKvk(data.kvk);
  if (data.kvk && data.kvk.replace(/\D/g, "") !== "" && !kvk) throw AppError.validation(tx.fout.kvk);
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
