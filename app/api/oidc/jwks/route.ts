import { NextResponse } from "next/server";
import { sleutels } from "@/lib/oidc/aanbieder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De publieke sleutel waarmee een dienst het id-token van ZekerFlex controleert.
export async function GET(): Promise<NextResponse> {
  const s = await sleutels();
  return NextResponse.json({ keys: [s.publiek] }, { headers: { "cache-control": "public, max-age=3600" } });
}
