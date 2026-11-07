import { NextResponse } from "next/server";
import { horecaAgentSpec } from "@/lib/openapi/horeca-agent";

export const dynamic = "force-static";

// De beschrijving van de reserverings-API voor AI-assistenten (lib/openapi/horeca-agent.ts).
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(horecaAgentSpec(), { headers: { "Cache-Control": "public, max-age=3600" } });
}
