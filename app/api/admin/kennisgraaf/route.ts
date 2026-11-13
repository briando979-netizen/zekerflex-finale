import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { breinData, leegBreinCache } from "@/lib/rag/brein";
import { VOEDING_MAX, voedBrein } from "@/lib/rag/voeding";
import { buurtVan, denkpad, groei, kennisgraaf, kennisgraafCSV, kennisgraafDOT, kennisgraafGraphML, kennisgraafLayout3D, kennisgraafRapport, knoopDetail, padTussen } from "@/lib/rag/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Kennisgraaf (lib/rag/graph.ts).
//   GET                          → de hele graaf met begrippen, thema's, clusters, bruggen, cijfers en hiaten (10 min cache; ?vers=1 vernieuwt)
//   GET ?knoop=<id>              → passages, buren, begrippen, thema en scores van één knoop
//   GET ?van=<id>&naar=<id>      → het kortste pad tussen twee knopen
//   GET ?buurt=<id>&diepte=1|2   → de buurt van een knoop (focusstand)
//   GET ?vraag=<tekst>           → het denkpad: welke knopen het brein voor die vraag pakt
//   GET ?groei=1                 → de nachtelijke momentopnamen (reeks + verschil)
//   GET ?layout=3d               → de vooraf berekende 3D-posities van de documentgraaf (per versie van de graaf gecachet)
//   GET ?brein=1                 → het Brein: alle geheugenstukken als neuronen met clusters, posities, stralen en de raadpleegtelling (lib/rag/brein.ts)
//   POST { tekst }               → "Voed het brein": de tekst wordt kennis in het geheugen; antwoord: de nieuwe stukken en hun verwanten (lib/rag/voeding.ts)
//   GET ?export=graphml|dot|json|csv-knopen|csv-lijnen|rapport → een bestand

const ID_MAX = 200;
const bestand = (inhoud: string, type: string, naam: string) =>
  new NextResponse(inhoud, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${naam}"` } });

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const q = new URL(request.url).searchParams;
  const knoop = q.get("knoop");
  if (knoop) {
    const d = await knoopDetail(knoop.slice(0, ID_MAX));
    if (!d) throw AppError.notFound("Deze knoop bestaat niet (meer)");
    return NextResponse.json(d);
  }
  const van = q.get("van");
  const naar = q.get("naar");
  if (van && naar) return NextResponse.json(await padTussen(van.slice(0, ID_MAX), naar.slice(0, ID_MAX)));
  const buurt = q.get("buurt");
  if (buurt) return NextResponse.json(await buurtVan(buurt.slice(0, ID_MAX), q.get("diepte") === "2" ? 2 : 1));
  const vraag = q.get("vraag")?.trim();
  if (vraag) {
    if (vraag.length > 400) throw AppError.validation("Houd de vraag onder de 400 tekens");
    return NextResponse.json(await denkpad(vraag));
  }
  if (q.has("groei")) return NextResponse.json(await groei());
  if (q.get("layout") === "3d") return NextResponse.json(await kennisgraafLayout3D());
  if (q.has("brein")) return NextResponse.json(await breinData(q.has("vers")));
  const exportAls = q.get("export");
  if (exportAls === "graphml") return bestand(await kennisgraafGraphML(), "application/xml; charset=utf-8", "zekerflex-kennisgraaf.graphml");
  if (exportAls === "dot") return bestand(await kennisgraafDOT(), "text/vnd.graphviz; charset=utf-8", "zekerflex-kennisgraaf.dot");
  if (exportAls === "csv-knopen") return bestand((await kennisgraafCSV()).knopen, "text/csv; charset=utf-8", "zekerflex-kennisgraaf-knopen.csv");
  if (exportAls === "csv-lijnen") return bestand((await kennisgraafCSV()).lijnen, "text/csv; charset=utf-8", "zekerflex-kennisgraaf-lijnen.csv");
  if (exportAls === "rapport") return bestand(await kennisgraafRapport(), "text/markdown; charset=utf-8", "zekerflex-kennisgraaf-rapport.md");
  const graaf = await kennisgraaf(q.has("vers"));
  if (exportAls === "json") return bestand(JSON.stringify({ nodes: graaf.nodes, edges: graaf.edges, themas: graaf.themas, op: graaf.op }, null, 2), "application/json; charset=utf-8", "zekerflex-kennisgraaf.json");
  return NextResponse.json(graaf);
});

const voedSchema = z.object({ tekst: z.string().min(1).max(VOEDING_MAX + 200) });

// POST: "Voed het brein". Alleen platformbeheer. De audit is onwisbaar en noemt daarom NIETS van de tekst (ook de titel
// niet: een beheerder kan er persoonsgegevens in plakken), alleen wie, het id en de aantallen. De tekst zelf staat
// uitsluitend in RagChunk en in de KV (brein:voeding:<id>), die wel te wissen zijn.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = voedSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Typ eerst iets om het brein te voeden.");
  const uit = await voedBrein(parsed.data.tekst, principal.userId);
  leegBreinCache();
  await recordAudit({
    category: "ADMIN",
    action: "brein.gevoed",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} voedde het brein (${uit.voeding.id}, ${parsed.data.tekst.trim().length} tekens)`,
    targetType: "rag",
    targetId: uit.voeding.id,
    metadata: { stukken: uit.chunkIds.length, buren: uit.buren.length, tekens: parsed.data.tekst.trim().length },
  });
  return NextResponse.json({ id: uit.voeding.id, titel: uit.voeding.titel, chunkIds: uit.chunkIds, buren: uit.buren });
});
