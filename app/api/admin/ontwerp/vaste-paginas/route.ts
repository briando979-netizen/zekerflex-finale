import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { VASTE_PAGINAS, isVastePagina, standaardPaginaIndeling, type VastePaginaId } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndelingen, resetPaginaIndeling, setPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De indeling van de vaste pagina's (Site-ontwerper, tabblad Pagina's): per pagina welke onderdelen onder de kop staan en in welke volgorde.

async function antwoord() {
  const eigen = await getPaginaIndelingen();
  const paginas = (Object.keys(VASTE_PAGINAS) as VastePaginaId[]).map((id) => ({
    id,
    naam: VASTE_PAGINAS[id].naam,
    pad: VASTE_PAGINAS[id].pad,
    secties: VASTE_PAGINAS[id].secties,
    indeling: eigen[id] ?? standaardPaginaIndeling(id),
    eigen: Boolean(eigen[id]),
  }));
  return { paginas };
}

// GET: alle vaste pagina's met hun indeling zoals die live staat.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await antwoord()));

const schema = z.object({ pagina: z.string().max(60), indeling: z.object({ volgorde: z.array(z.string().max(40)).max(40), verborgen: z.array(z.string().max(40)).max(40) }) });

// PUT: een eigen indeling van één pagina live zetten. Gelijk aan de standaard = de eigen versie weg.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isVastePagina(parsed.data.pagina)) throw AppError.validation("Deze indeling kon niet worden gelezen.");
  const pagina = parsed.data.pagina;
  const eigen = await setPaginaIndeling(pagina, parsed.data.indeling);
  // sommige pagina's bewaart Next een tijd (revalidate): meteen verversen, anders zie je de nieuwe indeling pas later
  revalidatePath(VASTE_PAGINAS[pagina].pad);
  await recordAudit({
    category: "ADMIN",
    action: "ontwerp.vaste-pagina",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: eigen ? `Indeling van de pagina ${VASTE_PAGINAS[pagina].naam} bijgewerkt` : `Indeling van de pagina ${VASTE_PAGINAS[pagina].naam} is weer de standaard`,
  });
  return NextResponse.json(await antwoord());
});

// DELETE ?pagina=…: die pagina terug naar de standaard.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const pagina = new URL(request.url).searchParams.get("pagina");
  if (!isVastePagina(pagina)) throw AppError.validation("Deze pagina bestaat niet.");
  await resetPaginaIndeling(pagina);
  revalidatePath(VASTE_PAGINAS[pagina].pad);
  await recordAudit({ category: "ADMIN", action: "ontwerp.vaste-pagina", actorUserId: principal.userId, actorLabel: "user", summary: `Indeling van de pagina ${VASTE_PAGINAS[pagina].naam} terug naar de standaard` });
  return NextResponse.json(await antwoord());
});
