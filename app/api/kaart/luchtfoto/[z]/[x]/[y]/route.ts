export const runtime = "nodejs";

// Luchtfoto-tegels voor ZekerFlex Kaart: de actuele luchtfoto van Nederland van
// PDOK (Beeldmateriaal Nederland, open data, CC BY 4.0), via onze eigen server
// zodat de CSP dicht blijft. Alleen Nederland, zoom 6 tot 19.

const BRON = "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857";

// tegelrand → lengte/breedte (web-mercator)
const lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const lat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }): Promise<Response> {
  const p = await params;
  const [z, x, y] = [Number(p.z), Number(p.x), Number((p.y ?? "").replace(/\.jpe?g$/, ""))];
  if (![z, x, y].every(Number.isInteger) || z < 6 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return new Response("Niet gevonden", { status: 404 });
  // alleen tegels die Nederland raken
  if (lon(x + 1, z) < 3.0 || lon(x, z) > 7.4 || lat(y, z) < 50.6 || lat(y + 1, z) > 53.7) return new Response("Buiten Nederland", { status: 404 });
  const res = await fetch(`${BRON}/${z}/${x}/${y}.jpeg`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) return new Response("Luchtfoto niet beschikbaar", { status: res?.status === 404 ? 404 : 502 });
  return new Response(await res.arrayBuffer(), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=604800" },
  });
}
