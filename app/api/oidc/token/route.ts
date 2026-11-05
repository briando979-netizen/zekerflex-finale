import { NextResponse } from "next/server";
import { principalForUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { toErrorBody } from "@/lib/errors";
import { wisselCode } from "@/lib/oidc/aanbieder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stap 2: de dienst wisselt de code (server-naar-server) in voor een id-token
// en een toegangstoken. Client-geheim via Basic-auth of in het formulier.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "oidc-token", identifier: clientIp(request), limit: 60, windowSeconds: 600 });
    const ct = request.headers.get("content-type") ?? "";
    const vorm = ct.includes("application/json") ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : Object.fromEntries(new URLSearchParams(await request.text()));
    const s = (k: string) => (typeof vorm[k] === "string" ? (vorm[k] as string) : "");
    let clientId = s("client_id");
    let clientSecret = s("client_secret");
    const basic = request.headers.get("authorization");
    if (basic?.startsWith("Basic ")) {
      const [id = "", geheim = ""] = Buffer.from(basic.slice(6), "base64").toString().split(":");
      clientId = decodeURIComponent(id);
      clientSecret = decodeURIComponent(geheim);
    }
    if (s("grant_type") !== "authorization_code") {
      return NextResponse.json({ error: "unsupported_grant_type", error_description: "Alleen authorization_code." }, { status: 400 });
    }
    const tokens = await wisselCode({ code: s("code"), clientId, clientSecret, redirectUri: s("redirect_uri"), codeVerifier: s("code_verifier") || undefined }, principalForUser);
    return NextResponse.json(tokens, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    // OAuth-stijl foutantwoord, zodat de dienst er iets mee kan
    const code = status === 401 ? "invalid_client" : "invalid_grant";
    return NextResponse.json({ error: code, error_description: (body as { error?: { message?: string } }).error?.message ?? "Mislukt." }, { status: status === 401 ? 401 : 400 });
  }
}
