import { NextResponse } from "next/server";
import { discovery } from "@/lib/oidc/jwt";
import { issuer } from "@/lib/oidc/aanbieder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OpenID Connect discovery: waar de kennisbank (en andere eigen diensten) de
// endpoints van "Inloggen met ZekerFlex" vinden (lib/oidc).
export function GET(): NextResponse {
  return NextResponse.json(discovery(issuer()), { headers: { "cache-control": "public, max-age=3600" } });
}
