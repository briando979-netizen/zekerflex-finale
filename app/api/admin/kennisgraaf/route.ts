import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { denkpad, kennisgraaf, kennisgraafGraphML, knoopDetail } from "@/lib/rag/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Kennisgraaf (lib/rag/graph.ts).
//   GET                  → de hele graaf met begrippen, clusters en hiaten (10 min cache; ?vers=1 vernieuwt)
//   GET ?knoop=<id>      → passages, buren en begrippen van één knoop
//   GET ?vraag=<tekst>   → het denkpad: welke knopen het brein voor die vraag pakt
//   GET ?export=graphml  → GraphML-bestand (Gephi, yEd); ?export=json → knopen en lijnen als JSON

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const q = new URL(request.url).searchParams;
  const knoop = q.get("knoop");
  if (knoop) {
    const d = await knoopDetail(knoop.slice(0, 200));
    if (!d) throw AppError.notFound("Deze knoop bestaat niet (meer)");
    return NextResponse.json(d);
  }
  const vraag = q.get("vraag")?.trim();
  if (vraag) {
    if (vraag.length > 400) throw AppError.validation("Houd de vraag onder de 400 tekens");
    return NextResponse.json(await denkpad(vraag));
  }
  const exportAls = q.get("export");
  if (exportAls === "graphml") {
    return new NextResponse(await kennisgraafGraphML(), {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": 'attachment; filename="zekerflex-kennisgraaf.graphml"' },
    });
  }
  const graaf = await kennisgraaf(q.has("vers"));
  if (exportAls === "json") {
    return new NextResponse(JSON.stringify({ nodes: graaf.nodes, edges: graaf.edges, op: graaf.op }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="zekerflex-kennisgraaf.json"' },
    });
  }
  return NextResponse.json(graaf);
});
