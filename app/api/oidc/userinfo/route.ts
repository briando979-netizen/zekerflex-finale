import { NextResponse } from "next/server";
import { principalForUser } from "@/lib/auth";
import { claimsVoor, gebruikerVanToken } from "@/lib/oidc/aanbieder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stap 3: met het toegangstoken de gegevens van de ingelogde gebruiker ophalen.
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  const rec = await gebruikerVanToken(auth?.startsWith("Bearer ") ? auth.slice(7) : null);
  const p = rec ? await principalForUser(rec.userId) : null;
  if (!rec || !p) return NextResponse.json({ error: "invalid_token" }, { status: 401, headers: { "www-authenticate": 'Bearer error="invalid_token"' } });
  return NextResponse.json({ sub: p.userId, ...claimsVoor(p, rec.scope) }, { headers: { "cache-control": "no-store" } });
}

export const POST = GET;
