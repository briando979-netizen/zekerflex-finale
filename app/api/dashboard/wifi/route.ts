import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { nieuwWifiWachtwoord } from "@/lib/netwerk/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Werker-app → Account → Wifi: een nieuw eigen wifi-wachtwoord (lib/netwerk/store.ts).
// Het oude werkt daarna niet meer; het wachtwoord zelf komt nooit in het logboek.
export const POST = withAuth(async (_request, { principal }) => {
  const wachtwoord = await nieuwWifiWachtwoord(principal.userId);
  await recordAudit({ category: "SECURITY", action: "netwerk.wifi.wachtwoord-nieuw", actorUserId: principal.userId, summary: "Nieuw wifi-wachtwoord gemaakt", targetType: "user", targetId: principal.userId });
  return NextResponse.json({ wachtwoord });
});
