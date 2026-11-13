import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { buurtVan, denkpad, groei, kennisgraaf, kennisgraafCSV, kennisgraafDOT, kennisgraafGraphML, kennisgraafRapport, knoopDetail, padTussen } from "@/lib/rag/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Kennisgraaf (lib/rag/graph.ts).
//   GET                          → de hele graaf met begrippen, thema's, clusters, bruggen, cijfers en hiaten (10 min cache; ?vers=1 vernieuwt)
//   GET ?knoop=<id>              → passages, buren, begrippen, thema en scores van één knoop
//   GET ?van=<id>&naar=<id>      → het kortste pad tussen twee knopen
//   GET ?buurt=<id>&diepte=1|2   → de buurt van een knoop (focusstand)
//   GET ?vraag=<tekst>           → het denkpad: welke knopen het brein voor die vraag pakt
//   GET ?groei=1                 → de nachtelijke momentopnamen (reeks + verschil)
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
