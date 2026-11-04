import { leesMedia, mediaItem } from "@/lib/ontwerp/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /beeld/<id>(?klein=1) — foto of video uit de media-bibliotheek van de
// Site-ontwerper, vanaf onze eigen herkomst. Een id is niet te raden en de
// bestanden veranderen nooit (een nieuwe upload krijgt een nieuw id), dus ze
// mogen een jaar in de cache. Video's ondersteunen Range: Safari speelt anders
// niets af en terugspoelen werkt dan nergens.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const item = await mediaItem(id);
  const nietGevonden = () => new Response("Dit bestand bestaat niet (meer).", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (!item) return nietGevonden();
  let data: Buffer;
  try {
    data = await leesMedia(item, new URL(request.url).searchParams.get("klein") === "1");
  } catch {
    return nietGevonden();
  }
  const basis = {
    "Content-Type": item.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const range = item.soort === "video" ? /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "") : null;
  if (range) {
    const totaal = data.length;
    let start = range[1] ? Number(range[1]) : NaN;
    let eind = range[2] ? Number(range[2]) : NaN;
    if (Number.isNaN(start)) {
      // "bytes=-500": de laatste 500 bytes
      start = Math.max(0, totaal - (Number.isNaN(eind) ? totaal : eind));
      eind = totaal - 1;
    } else if (Number.isNaN(eind) || eind >= totaal) {
      eind = totaal - 1;
    }
    if (start >= totaal || start > eind) return new Response(null, { status: 416, headers: { ...basis, "Content-Range": `bytes */${totaal}` } });
    return new Response(new Uint8Array(data.subarray(start, eind + 1)), {
      status: 206,
      headers: { ...basis, "Content-Range": `bytes ${start}-${eind}/${totaal}`, "Content-Length": String(eind - start + 1) },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...basis, "Content-Length": String(data.length) } });
}
