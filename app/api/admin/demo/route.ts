import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import {
  DEMO_WERKER_EMAIL,
  DEMO_WERKGEVER_EMAIL,
  clearDemoAccounts,
  demoAccountStatus,
  demoWachtwoordTonen,
  demoWachtwoordVernieuwen,
  seedDemoAccounts,
} from "@/lib/demo/seed-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Kosteloze accounts: het demo-voorbeeldaccount opzetten/bijwerken of wissen. Eén voorbeeld-werkgever en
// -werker met nepdata (lib/demo/seed-account.ts), zodat de eigenaar prospects kan laten zien hoe een account eruitziet.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () =>
  NextResponse.json({
    status: await demoAccountStatus(),
    werkgeverEmail: DEMO_WERKGEVER_EMAIL,
    werkerEmail: DEMO_WERKER_EMAIL,
    wachtwoord: await demoWachtwoordTonen(),
  }),
);

const schema = z.object({ action: z.enum(["seed", "clear", "nieuw-wachtwoord"]) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { action } = schema.parse(await request.json().catch(() => ({})));
  if (action === "clear") {
    await clearDemoAccounts();
  } else if (action === "nieuw-wachtwoord") {
    await demoWachtwoordVernieuwen();
  } else {
    await seedDemoAccounts({ userId: principal.userId, name: principal.email });
  }
  return NextResponse.json({ ok: true, status: await demoAccountStatus(), wachtwoord: await demoWachtwoordTonen() });
});
