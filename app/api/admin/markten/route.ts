import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { leesBudgetCents, leesLaatsteRapport, scanMarkten, zetBudgetCents } from "@/lib/markten/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Admin → Agenten & markten: laatste scan, speelgeld-budget instellen, nu scannen.
// Alles is signalering en voorstellen; er gaat hier nooit geld of handel uit.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ rapport: await leesLaatsteRapport(), budgetCents: await leesBudgetCents() }));

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const { budgetCents } = z.object({ budgetCents: z.number().min(0).max(10_000_000) }).parse(await request.json());
  return NextResponse.json({ budgetCents: await zetBudgetCents(budgetCents) });
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ rapport: await scanMarkten() }));
