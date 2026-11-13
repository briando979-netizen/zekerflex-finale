import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { BANKEN, startToestemming } from "@/lib/boekhouding/bank/koppeling/toestemming";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVE = { "Cache-Control": "private, no-store" };
const invoer = z.object({
  bankRekeningId: z.string().trim().regex(/^[a-z0-9]{10,40}$/i, "Kies een geldige bankrekening."),
  bank: z.enum(BANKEN, { message: "Kies ING, Rabobank of ABN AMRO." }),
});

// POST { bankRekeningId, bank }: geeft de link waar de eigenaar bij de bank toestemming geeft (daarna komt hij terug op
// .../koppeling/terug). De link bevat een eenmalige code en komt nergens in een log of in het auditspoor.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met bankRekeningId en bank.");
    }),
  );
  if (!env.AUTH_URL) throw AppError.validation("Het adres van de site (AUTH_URL) is niet ingesteld: de bank weet dan niet waar ze je naartoe moet terugsturen.");
  const { url } = await startToestemming({ bankRekeningId: body.bankRekeningId, bank: body.bank, door: principal.userId, basisUrl: env.AUTH_URL });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bankkoppeling_gestart",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: toestemming voor de bankkoppeling gestart",
    targetType: "boekBankRekening",
    targetId: body.bankRekeningId,
    metadata: { bank: body.bank },
  });
  return NextResponse.json({ url }, { status: 200, headers: PRIVE });
});
