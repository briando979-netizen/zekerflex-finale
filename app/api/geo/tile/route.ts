import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// OpenStreetMap raster-tile proxy. The app's CSP is `img-src 'self'`, so map
// tiles cannot be loaded from tile.openstreetmap.org directly — this route
// fetches them server-side (CSP is a browser rule, not a server one) and serves
// them from our own origin. Heavily cached; login-gated to keep it internal.
//   GET /api/geo/tile?z=15&x=16824&y=10770
// ---------------------------------------------------------------------------

const SUBDOMAINS = ["a", "b", "c"];

export async function GET(req: Request): Promise<Response> {
  try {
    await requirePrincipal();
  } catch {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const z = Number(searchParams.get("z"));
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));

  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 19) {
    return new NextResponse("bad tile", { status: 400 });
  }
  const n = 2 ** z;
  if (x < 0 || x >= n || y < 0 || y >= n) {
    return new NextResponse("tile out of range", { status: 400 });
  }

  const sub = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  const upstream = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

  try {
    const r = await fetch(upstream, {
      headers: {
        "User-Agent": "ZekerFlex/1.0 (kaartweergave in de app; +https://zekerflex.com)",
        Accept: "image/png,image/*;q=0.8",
      },
      cache: "force-cache",
    });
    if (!r.ok) return new NextResponse("tile upstream error", { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
      },
    });
  } catch {
    return new NextResponse("tile fetch failed", { status: 502 });
  }
}
