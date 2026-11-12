import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { leesBtwConcept, maakBtwConcept } from "@/lib/boekhouding/btw/concept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;

const kwartaalInvoer = z.object({
  administratieId: z.string().trim().regex(ID, "Kies een geldige administratie."),
  jaar: z.coerce.number().int("Het jaar is geen geldig jaar."),
  kwartaal: z.coerce.number().int("Een kwartaal is 1, 2, 3 of 4."),
});

// GET ?administratieId=&jaar=&kwartaal=: de nieuwste versie van het btw-concept van dat kwartaal (of null), het aantal
// versies en de laatste dag voor indienen. Alleen lezen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const q = new URL(request.url).searchParams;
  const invoer = kwartaalInvoer.parse({ administratieId: q.get("administratieId"), jaar: q.get("jaar"), kwartaal: q.get("kwartaal") });
  return NextResponse.json(await leesBtwConcept(invoer.administratieId, invoer.jaar, invoer.kwartaal));
});

// POST { administratieId, jaar, kwartaal }: maakt een nieuw concept (nieuwe versie). Dient nooit iets in.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const invoer = kwartaalInvoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met administratieId, jaar en kwartaal.");
    }),
  );
  const concept = await maakBtwConcept(invoer.administratieId, invoer.jaar, invoer.kwartaal);
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.btw_concept_gemaakt",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: btw-concept gemaakt",
    targetType: "boekBtwAangifte",
    targetId: concept.id,
    metadata: {
      jaar: concept.jaar,
      kwartaal: concept.kwartaal,
      versie: concept.versie,
      blokkades: concept.inhoud.meldingen.filter((m) => m.ernst === "blokkeert").length,
    },
  });
  return NextResponse.json({ concept }, { status: 201 });
});
