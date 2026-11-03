import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De kaartdata van ZekerFlex Kaart (deploy/kaart/haal-kaart.sh): de vectortegels
// van Nederland (één PMTiles-bestand, gelezen in stukjes via Range-verzoeken),
// de lettertypes en de symbolen. Zelf gehost, zodat de kaart niet van een ander
// afhangt en de CSP (connect-src 'self') gewoon dicht kan blijven. Alleen bekende
// bestanden; geen mappen, geen ../.
// ---------------------------------------------------------------------------

// Alleen uit de omgeving (docker-compose.vps.yml zet /app/kaart-data), bewust zonder
// letterlijk pad: anders neemt de standalone-trace van Next de 2 GB mee in de image.
const MAP = process.env.KAART_DATA_DIR ?? "";

const TOEGESTAAN: { patroon: RegExp; type: string; cache: string }[] = [
  { patroon: /^nl\.pmtiles$/, type: "application/octet-stream", cache: "public, max-age=86400" },
  { patroon: /^fonts\/Noto Sans (Regular|Medium|Italic)\/\d{1,5}-\d{1,5}\.pbf$/, type: "application/x-protobuf", cache: "public, max-age=2592000, immutable" },
  { patroon: /^sprites\/(light|dark|white|grayscale|black)(@2x)?\.json$/, type: "application/json", cache: "public, max-age=604800" },
  { patroon: /^sprites\/(light|dark|white|grayscale|black)(@2x)?\.png$/, type: "image/png", cache: "public, max-age=604800" },
  { patroon: /^versie\.txt$/, type: "text/plain; charset=utf-8", cache: "no-cache" },
];

export async function GET(request: Request, { params }: { params: Promise<{ pad: string[] }> }): Promise<Response> {
  const rel = (await params).pad.map((d) => decodeURIComponent(d)).join("/");
  const regel = TOEGESTAAN.find((t) => t.patroon.test(rel));
  if (!MAP || !regel || rel.includes("..")) return new Response("Niet gevonden", { status: 404 });
  const bestand = path.join(MAP, rel);
  let grootte: number;
  try {
    grootte = (await stat(bestand)).size;
  } catch {
    return new Response("Niet gevonden", { status: 404 });
  }
  const basis = { "content-type": regel.type, "cache-control": regel.cache, "accept-ranges": "bytes" };

  // Range: bytes=a-b (PMTiles leest altijd een stuk)
  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) return new Response(null, { status: 416, headers: { "content-range": `bytes */${grootte}` } });
    let begin = m[1] === "" ? Math.max(0, grootte - Number(m[2])) : Number(m[1]);
    let eind = m[1] !== "" && m[2] !== "" ? Number(m[2]) : grootte - 1;
    eind = Math.min(eind, grootte - 1);
    if (begin > eind || begin >= grootte) return new Response(null, { status: 416, headers: { "content-range": `bytes */${grootte}` } });
    // hooguit 16 MB per verzoek
    if (eind - begin > 16_000_000) eind = begin + 16_000_000;
    begin = Math.max(0, begin);
    const stroom = Readable.toWeb(createReadStream(bestand, { start: begin, end: eind })) as ReadableStream;
    return new Response(stroom, {
      status: 206,
      headers: { ...basis, "content-range": `bytes ${begin}-${eind}/${grootte}`, "content-length": String(eind - begin + 1) },
    });
  }
  if (grootte > 20_000_000) return new Response("Gebruik een Range-verzoek", { status: 416, headers: { ...basis, "content-range": `bytes */${grootte}` } });
  const stroom = Readable.toWeb(createReadStream(bestand)) as ReadableStream;
  return new Response(stroom, { headers: { ...basis, "content-length": String(grootte) } });
}
