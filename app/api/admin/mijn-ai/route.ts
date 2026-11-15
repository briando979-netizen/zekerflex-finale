import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { modelForPurpose } from "@/lib/ai/models";
import { gratisAan, primeGratis } from "@/lib/ai/gratis";
import { gesprekken, nieuwGesprek } from "@/lib/mijn-ai/opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mijn AI (lib/mijn-ai/vorm.ts), alleen voor platformbeheerders en alleen je eigen gesprekken:
//   GET  → { gesprekken: [{ id, titel, bijgewerkt }], model, gratis }
//   POST → een nieuw, leeg gesprek → { gesprek }

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  await primeGratis().catch(() => undefined);
  return NextResponse.json({ gesprekken: await gesprekken(principal.userId), model: modelForPurpose("mijn-ai"), gratis: gratisAan() });
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  return NextResponse.json({ gesprek: await nieuwGesprek(principal.userId) }, { status: 201 });
});
