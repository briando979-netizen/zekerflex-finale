import { NextResponse } from "next/server";
import { resolveByHost } from "@/lib/tenancy/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/tenancy/resolve?host=klant1.jouwplatform.nl
// Publiek: geeft de tenant + branding voor een host (branding is openbaar). Zo
// kan een middleware of de frontend per host het juiste merk tonen. Null = geen
// gekoppelde klant → standaard ZekerFlex-merk.
export async function GET(request: Request): Promise<NextResponse> {
  const host = new URL(request.url).searchParams.get("host") ?? request.headers.get("host") ?? "";
  const entry = await resolveByHost(host);
  if (!entry) return NextResponse.json({ matched: false, tenantId: null, brand: null });
  return NextResponse.json({ matched: true, tenantId: entry.tenantId, brand: entry.brand });
}
