import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { jsonError } from "@/lib/http/errors";
import { osRolVan } from "@/lib/os/rol";
import { getOsInstellingen, setOsInstellingen } from "@/lib/os/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/os/instellingen — je eigen bureaublad (vastgezette apps, achtergrond).
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const rol = osRolVan(principal);
    return NextResponse.json({ instellingen: await getOsInstellingen(principal.userId, rol) });
  } catch (err) {
    return jsonError(err);
  }
}

// PUT /api/os/instellingen — je eigen bureaublad bewaren. Een app die bij jouw
// rol niet hoort valt er bij het opslaan uit (lib/os/instellingen.ts).
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const rol = osRolVan(principal);
    const raw = await request.json().catch(() => null);
    return NextResponse.json({ instellingen: await setOsInstellingen(principal.userId, rol, raw) });
  } catch (err) {
    return jsonError(err);
  }
}
