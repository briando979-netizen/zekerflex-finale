import { NextResponse } from "next/server";
import { appVan, manifestVan } from "@/lib/apps/catalogus";

// Het manifest van een ZekerFlex-app (lib/apps/catalogus.ts): een eigen id, naam, kleur en beginscherm, zodat de app als
// losse app op het beginscherm komt, naast de andere.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const app = appVan((await params).id);
  if (!app) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json(manifestVan(app), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  });
}
