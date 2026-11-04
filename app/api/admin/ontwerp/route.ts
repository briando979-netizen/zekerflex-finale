import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { getOntwerpStaat, publiceer, saveConcept, zetTerug } from "@/lib/ontwerp/store";
import { herschrijfTekst, ontwerpAssistent, stelThemaVoor, TEKST_OPDRACHTEN, type TekstOpdracht } from "@/lib/ontwerp/ai";
import { CONTENT_REGISTRY, getContentValues } from "@/lib/content/store";
import { normalizeThema } from "@/lib/ontwerp/thema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// GET: concept, live en geschiedenis van de Site-ontwerper.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json(await getOntwerpStaat());
});

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("concept"), thema: z.record(z.unknown()) }),
  z.object({ actie: z.literal("publiceer"), notitie: z.string().max(200).default("") }),
  z.object({ actie: z.literal("terugzetten"), id: z.string().min(8).max(64) }),
  z.object({ actie: z.literal("ai-stijl"), omschrijving: z.string().trim().min(3).max(600), huidig: z.record(z.unknown()) }),
  z.object({ actie: z.literal("assistent"), vraag: z.string().trim().min(3).max(800), thema: z.record(z.unknown()), teksten: z.record(z.string().max(2000)).default({}) }),
  z.object({
    actie: z.literal("ai-tekst"),
    tekst: z.string().trim().min(1).max(2000),
    opdracht: z.enum(TEKST_OPDRACHTEN as [TekstOpdracht, ...TekstOpdracht[]]),
    label: z.string().max(120).default(""),
  }),
]);

// POST: concept opslaan, publiceren, een versie terugzetten of de AI om een voorstel vragen.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(
    await request.json().catch(() => {
      throw AppError.validation("Ongeldig verzoek.");
    }),
  );
  if (!parsed.success) throw AppError.validation("Deze wijziging kon niet worden gelezen.");
  const input = parsed.data;
  const door = principal.userId;

  switch (input.actie) {
    case "concept": {
      const thema = await saveConcept(input.thema, door);
      return NextResponse.json({ ok: true, concept: thema });
    }
    case "publiceer": {
      const versie = await publiceer(door, input.notitie);
      await recordAudit({ category: "ADMIN", action: "ontwerp.publish", actorUserId: principal.userId, actorLabel: "user", summary: `Site-ontwerp gepubliceerd${versie.notitie ? `: ${versie.notitie}` : ""}` });
      return NextResponse.json({ ok: true, ...(await getOntwerpStaat()) });
    }
    case "terugzetten": {
      const thema = await zetTerug(input.id, door);
      if (!thema) throw AppError.validation("Deze versie bestaat niet meer.");
      return NextResponse.json({ ok: true, concept: thema });
    }
    case "ai-stijl": {
      const voorstel = await stelThemaVoor(input.omschrijving, normalizeThema(input.huidig));
      return NextResponse.json({ ok: true, ...voorstel });
    }
    case "assistent": {
      // de teksten zoals ze nu in de ontwerper staan (ook nog niet opgeslagen), alleen bekende sleutels
      const bewaard = await getContentValues();
      const teksten = CONTENT_REGISTRY.map((c) => ({ key: c.key, label: `${c.group ?? ""} — ${c.label}`, waarde: input.teksten[c.key] ?? bewaard[c.key] ?? c.default }));
      const antwoord = await ontwerpAssistent(input.vraag, normalizeThema(input.thema), teksten);
      const labels = Object.fromEntries(Object.keys(antwoord.teksten).map((k) => [k, teksten.find((t) => t.key === k)?.label ?? k]));
      return NextResponse.json({ ok: true, ...antwoord, labels });
    }
    case "ai-tekst": {
      const tekst = await herschrijfTekst(input.tekst, input.opdracht, input.label);
      return NextResponse.json({ ok: true, tekst });
    }
  }
});
