import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { hasRole } from "@/lib/auth";
import { withAuth } from "@/lib/auth/handlers";
import { featureEnabled } from "@/lib/flags";
import { recordAudit } from "@/lib/audit";
import { MODULES } from "@/lib/netwerk/modules";
import { startModule, zegModuleOp } from "@/lib/netwerk/abonnement";
import { netwerkTenantOf, noteerVpnSleutel, verwijderWifiVestiging, zetWifiVestiging } from "@/lib/netwerk/store";
import { maakVpnSleutel, verwijderVpnApparaat, vpnAdres } from "@/lib/netwerk/headscale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Werkgever → Wifi en VPN (lib/netwerk). Alleen de beheerder van het bedrijf.
// POST met een "actie":
//   start           een pakket aanzetten (betalen, op de lijst of aanvragen)
//   opzeggen        een pakket stoppen
//   wifi-vestiging  de wifi van een vestiging instellen (IP, netwerknaam, aan/uit)
//   wifi-weg        die instelling verwijderen
//   vpn-sleutel     een eenmalige VPN-toegangscode (wordt één keer getoond)
//   vpn-apparaat-weg een apparaat van het netwerk halen
// Het scherm zelf (app/werkgever/netwerk) laadt de gegevens op de server.
// ---------------------------------------------------------------------------

const actieSchema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("start"),
    sleutel: z.enum(MODULES),
    aantal: z.number().int().min(1).max(500).default(1),
    variant: z.enum(["per-gebruiker", "onbeperkt"]).optional(),
    toelichting: z.string().max(2000).optional(),
  }),
  z.object({ actie: z.literal("opzeggen"), sleutel: z.enum(MODULES) }),
  z.object({ actie: z.literal("wifi-vestiging"), branchId: z.string().min(1).max(64), ip: z.string().max(64), ssid: z.string().max(64), aan: z.boolean().default(true) }),
  z.object({ actie: z.literal("wifi-weg"), branchId: z.string().min(1).max(64) }),
  z.object({ actie: z.literal("vpn-sleutel"), uren: z.number().int().min(1).max(720).default(24) }),
  z.object({ actie: z.literal("vpn-apparaat-weg"), id: z.string().min(1).max(64) }),
]);

export const POST = withAuth(async (request, { principal }) => {
  if (!(await featureEnabled("netwerk-pakketten", { userId: principal.userId }))) throw AppError.forbidden("Dit onderdeel staat uit.");
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.forbidden("Alleen de beheerder van het bedrijf kan dit.");
  const tenantId = await netwerkTenantOf(principal);
  const body = actieSchema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    }),
  );

  switch (body.actie) {
    case "start": {
      const r = await startModule(tenantId, { sleutel: body.sleutel, aantal: body.aantal, ...(body.variant ? { variant: body.variant } : {}), ...(body.toelichting ? { toelichting: body.toelichting } : {}) }, principal);
      return NextResponse.json(r);
    }
    case "opzeggen":
      return NextResponse.json(await zegModuleOp(tenantId, body.sleutel, principal));
    case "wifi-vestiging": {
      const v = await zetWifiVestiging(tenantId, body.branchId, { ip: body.ip, ssid: body.ssid, aan: body.aan });
      // het geheim en het IP komen bewust niet in het logboek
      await recordAudit({ category: "ADMIN", action: "netwerk.wifi.vestiging", actorUserId: principal.userId, summary: `Wifi ingesteld voor vestiging ${body.branchId}`, targetType: "tenant", targetId: tenantId });
      return NextResponse.json({ vestiging: v });
    }
    case "wifi-weg":
      await verwijderWifiVestiging(tenantId, body.branchId);
      return NextResponse.json({ ok: true });
    case "vpn-sleutel": {
      const s = await maakVpnSleutel(tenantId, body.uren);
      await noteerVpnSleutel(tenantId, { userId: principal.userId, naam: principal.fullName, at: new Date().toISOString(), verlooptAt: s.verlooptAt });
      await recordAudit({ category: "SECURITY", action: "netwerk.vpn.sleutel", actorUserId: principal.userId, summary: `VPN-toegangscode gemaakt (geldig tot ${s.verlooptAt.slice(0, 16)})`, targetType: "tenant", targetId: tenantId });
      return NextResponse.json({ sleutel: s.sleutel, verlooptAt: s.verlooptAt, server: vpnAdres() });
    }
    case "vpn-apparaat-weg":
      await verwijderVpnApparaat(tenantId, body.id);
      await recordAudit({ category: "SECURITY", action: "netwerk.vpn.apparaat-weg", actorUserId: principal.userId, summary: "Apparaat van de VPN gehaald", targetType: "tenant", targetId: tenantId });
      return NextResponse.json({ ok: true });
  }
});
