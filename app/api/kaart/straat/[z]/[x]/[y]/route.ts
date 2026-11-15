export const runtime = "nodejs";

// Straatkaart-tegels voor het kaartje in de chat bij een gedeelde locatie: de BRT Achtergrondkaart van PDOK (Kadaster, open
// data, CC BY 4.0), via onze eigen server zodat de CSP dicht blijft en niemand een externe partij ziet wie de chat opent.
// Alleen Nederland, zoom 10 tot 19.

const BRON = "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857";

// tegelrand → lengte/breedte (web-mercator)
const lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const lat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }): Promise<Response> {
  const p = await params;
  const [z, x, y] = [Number(p.z), Number(p.x), Number((p.y ?? "").replace(/\.png$/, ""))];
  if (![z, x, y].every(Number.isInteger) || z < 10 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return new Response("Niet gevonden", { status: 404 });
  // alleen tegels die Nederland raken
  if (lon(x + 1, z) < 3.0 || lon(x, z) > 7.4 || lat(y, z) < 50.6 || lat(y + 1, z) > 53.7) return new Response("Buiten Nederland", { status: 404 });
  const res = await fetch(`${BRON}/${z}/${x}/${y}.png`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) return new Response("Kaart niet beschikbaar", { status: res?.status === 404 ? 404 : 502 });
  return new Response(await res.arrayBuffer(), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff" },
  });
}
