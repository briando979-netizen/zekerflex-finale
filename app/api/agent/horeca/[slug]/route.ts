import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { agentZaak } from "@/lib/horeca/agent-server";
import { zaakVoorAgent } from "@/lib/horeca/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voor AI-assistenten: één zaak met openingstijden en de regels voor reserveren.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "agent-horeca-kijk", identifier: clientIp(request), limit: 300, windowSeconds: 600 });
    const zaak = await agentZaak((await params).slug);
    return NextResponse.json({ zaak: zaakVoorAgent(zaak, env.APP_BASE_URL.replace(/\/+$/, "")) }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
