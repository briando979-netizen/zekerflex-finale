import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { agentZaken } from "@/lib/horeca/agent-server";
import { zaakVoorAgent } from "@/lib/horeca/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voor AI-assistenten: de horecazaken waar je online een tafel kunt reserveren.
// Openbaar (lib/auth/public-routes.ts), alleen lezen, IP-begrensd. Beschrijving:
// /api/agent/horeca/openapi.json. ?plaats= filtert op plaats.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "agent-horeca-kijk", identifier: clientIp(request), limit: 300, windowSeconds: 600 });
    const plaats = new URL(request.url).searchParams.get("plaats")?.trim().toLowerCase() ?? "";
    const basis = env.APP_BASE_URL.replace(/\/+$/, "");
    const zaken = (await agentZaken()).filter((z) => !plaats || z.plaats.toLowerCase().includes(plaats)).map((z) => zaakVoorAgent(z, basis));
    return NextResponse.json({ zaken }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
