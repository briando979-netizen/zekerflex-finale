import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { lijstBankRekeningen, maakBankRekening } from "@/lib/boekhouding/bank/scherm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;
const PRIVE = { "Cache-Control": "private, no-store" };

// GET ?administratieId=: de bankrekeningen van een administratie, het IBAN gemaskeerd (laatste vier tekens).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const administratieId = z.string().trim().regex(ID, "Kies een geldige administratie.").parse(new URL(request.url).searchParams.get("administratieId"));
  return NextResponse.json({ rekeningen: await lijstBankRekeningen(administratieId) }, { headers: PRIVE });
});

const invoer = z.object({
  administratieId: z.string().trim().regex(ID, "Kies een geldige administratie."),
  naam: z.string().trim().min(1, "Geef de bankrekening een naam.").max(80),
  iban: z.string().trim().min(10, "Vul het IBAN in.").max(42),
  grootboekNummer: z.string().trim().min(1).max(20).optional(),
});

// POST { administratieId, naam, iban, grootboekNummer? }: voegt een bankrekening toe. Het IBAN wordt gecontroleerd
// (modulo 97). In het auditspoor komt het IBAN NIET.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met administratieId, naam en iban.");
    }),
  );
  const rekening = await maakBankRekening(body);
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bankrekening_toegevoegd",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: bankrekening toegevoegd",
    targetType: "boekBankRekening",
    targetId: rekening.id,
    metadata: { grootboekNummer: rekening.grootboekNummer },
  });
  return NextResponse.json({ rekening }, { status: 201, headers: PRIVE });
});
