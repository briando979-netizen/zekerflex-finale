import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MAX_BEDRIJF, MAX_NAAM, controleerIntroductie, type OngeldigVeld, type OntbrekendVeld } from "@/lib/introducties/regels";
import { dienIntroductieIn, mijnIntroducties } from "@/lib/introducties/opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/me/introducties — de eigen introducties met hun stand ("Introduceer een bedrijf", lib/introducties/regels.ts).
// POST /api/me/introducties — een bedrijf voorstellen. Alleen ingelogd (werker of werkgever), hooguit tien per dag. Maakt
// een lead zonder campagne: niemand krijgt vanzelf een mail, een mens neemt contact op. Het scherm toont de foutmelding in
// de eigen taal op `details.veld`; de Nederlandse tekst hieronder is voor wie de API zelf leest.

const schema = z.object({
  rol: z.enum(["werker", "werkgever"]),
  contactNaam: z.string().max(MAX_NAAM * 2),
  bedrijf: z.string().max(MAX_BEDRIJF * 2),
  email: z.string().max(254).optional(),
  telefoon: z.string().max(40).optional(),
  toestemming: z.boolean(),
});

const MELDING: Record<OntbrekendVeld | OngeldigVeld, string> = {
  contactNaam: "Vul de naam van de contactpersoon in.",
  bedrijf: "Vul de bedrijfsnaam in.",
  contact: "Vul een e-mailadres of een telefoonnummer in.",
  toestemming: "Vink aan dat deze persoon weet dat ZekerFlex contact opneemt.",
  email: "Dit e-mailadres klopt niet.",
  telefoon: "Dit telefoonnummer klopt niet.",
};

export const GET = withAuth(async (_request, { principal }) => {
  return NextResponse.json({ introducties: await mijnIntroducties(principal.userId) });
});

export const POST = withAuth(async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => ({})));
  const controle = controleerIntroductie(body);
  const veld = controle.ontbreekt[0] ?? controle.ongeldig[0];
  if (!controle.schoon || veld) throw AppError.validation(veld ? MELDING[veld] : MELDING.contact, { veld: veld ?? "contact" });
  await enforceRateLimit({
    name: "introductie",
    identifier: principal.userId,
    limit: 10,
    windowSeconds: 24 * 3600,
    message: "Je hebt vandaag al veel bedrijven voorgesteld. Probeer het morgen opnieuw.",
  });
  const uit = await dienIntroductieIn({ ...controle.schoon, userId: principal.userId, eigenEmail: principal.email, rol: body.rol });
  return NextResponse.json(uit, { status: 201 });
});
