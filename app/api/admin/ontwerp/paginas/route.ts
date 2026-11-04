import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { maakPaginaMetAi, vertaalPagina } from "@/lib/ontwerp/ai";
import { bewaarConcept, bewaarVertaling, haalOffline, maakPagina, paginaLijst, publiceerPagina, verwijderPagina, verwijderVertaling, zetSlug } from "@/lib/ontwerp/paginas-store";
import { TALEN, normalizeInhoud, opVormVanOrigineel, type Taal } from "@/lib/ontwerp/paginas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// GET: alle eigen pagina's van de Site-ontwerper.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ paginas: await paginaLijst() });
});

const id = z.string().regex(/^pg[a-f0-9]{12}$/);
const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("nieuw"), titel: z.string().max(120).default(""), sjabloon: z.string().max(40).default("leeg") }),
  z.object({ actie: z.literal("ai"), onderwerp: z.string().trim().min(5).max(600) }),
  z.object({ actie: z.literal("concept"), id, inhoud: z.record(z.unknown()) }),
  z.object({ actie: z.literal("slug"), id, slug: z.string().trim().min(1).max(80) }),
  z.object({ actie: z.literal("publiceer"), id }),
  z.object({ actie: z.literal("offline"), id }),
  z.object({ actie: z.literal("verwijder"), id }),
  z.object({ actie: z.literal("vertaal"), id, taal: z.enum(Object.keys(TALEN) as [Taal, ...Taal[]]) }),
  z.object({ actie: z.literal("vertaling"), id, taal: z.enum(Object.keys(TALEN) as [Taal, ...Taal[]]), inhoud: z.record(z.unknown()) }),
  z.object({ actie: z.literal("vertaling-weg"), id, taal: z.enum(Object.keys(TALEN) as [Taal, ...Taal[]]) }),
]);

// POST: een pagina maken (leeg, uit een sjabloon of met AI), het concept bewaren, publiceren of offline halen.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(
    await request.json().catch(() => {
      throw AppError.validation("Ongeldig verzoek.");
    }),
  );
  if (!parsed.success) throw AppError.validation("Deze wijziging kon niet worden gelezen.");
  const input = parsed.data;
  const audit = (action: string, summary: string) => recordAudit({ category: "ADMIN", action, actorUserId: principal.userId, actorLabel: "user", summary });

  switch (input.actie) {
    case "nieuw":
      return NextResponse.json({ ok: true, pagina: await maakPagina(input.titel, input.sjabloon) });
    case "ai": {
      const inhoud = await maakPaginaMetAi(input.onderwerp);
      return NextResponse.json({ ok: true, pagina: await maakPagina(inhoud.titel, "leeg", inhoud) });
    }
    case "concept":
      return NextResponse.json({ ok: true, pagina: await bewaarConcept(input.id, input.inhoud) });
    case "slug":
      return NextResponse.json({ ok: true, pagina: await zetSlug(input.id, input.slug) });
    case "publiceer": {
      const pagina = await publiceerPagina(input.id);
      await audit("ontwerp.page.publish", `Eigen pagina gepubliceerd: /p/${pagina.slug}`);
      return NextResponse.json({ ok: true, pagina });
    }
    case "offline": {
      const pagina = await haalOffline(input.id);
      await audit("ontwerp.page.offline", `Eigen pagina offline gehaald: /p/${pagina.slug}`);
      return NextResponse.json({ ok: true, pagina });
    }
    case "verwijder":
      await verwijderPagina(input.id);
      await audit("ontwerp.page.delete", `Eigen pagina verwijderd (${input.id})`);
      return NextResponse.json({ ok: true });
    case "vertaal": {
      // vertaalt het concept zoals het nu bewaard staat (de editor bewaart eerst)
      const pagina = (await paginaLijst()).find((p) => p.id === input.id);
      if (!pagina) throw AppError.validation("Deze pagina bestaat niet meer.");
      const vertaald = await vertaalPagina(pagina.concept, input.taal);
      return NextResponse.json({ ok: true, pagina: await bewaarVertaling(input.id, input.taal, vertaald) });
    }
    case "vertaling": {
      // met de hand bijgewerkt: de vorm blijft die van het origineel
      const pagina = (await paginaLijst()).find((p) => p.id === input.id);
      if (!pagina) throw AppError.validation("Deze pagina bestaat niet meer.");
      return NextResponse.json({ ok: true, pagina: await bewaarVertaling(input.id, input.taal, opVormVanOrigineel(pagina.concept, normalizeInhoud(input.inhoud))) });
    }
    case "vertaling-weg":
      return NextResponse.json({ ok: true, pagina: await verwijderVertaling(input.id, input.taal) });
  }
});
