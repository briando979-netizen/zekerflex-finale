import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { featureEnabled, setFlag } from "@/lib/flags";
import { liveVersie } from "@/lib/bouwer/versie";
import { herstelNaStopMetSlot, leesAutoStand, leesModus, leesNoodremReden, noodremAan, zetModus, zetNoodrem } from "@/lib/bouwer/auto-uitrol-opslag";
import { LEGE_STAND, autoModus, meldingen } from "@/lib/bouwer/auto-uitrol-regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin -> Live zetten -> Auto-uitrol: de drie standen (uit / kijken / aan), de noodrem en de laatste beslissingen. Alleen platformbeheer.
// uit = de vlag auto-uitrol staat uit; kijken = vlag aan en modus "kijken" (droog: de lus plaatst nooit een verzoek); aan = vlag aan en modus
// "aan" (alleen na een bevestiging). Een onbekende modus telt als uit (lib/bouwer/auto-uitrol-regels.ts, autoModus).
async function stand() {
  const [vlag, modusRuw, noodrem, s] = await Promise.all([featureEnabled("auto-uitrol").catch(() => false), leesModus(), noodremAan().catch(() => true), leesAutoStand().catch(() => LEGE_STAND)]);
  const modus = autoModus(vlag, modusRuw);
  const live = liveVersie();
  return { aan: modus !== "uit", modus, noodrem, noodremReden: await leesNoodremReden(), stand: s, meldingen: meldingen(s, live?.sha ?? null, Date.now(), modus !== "uit") };
}

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await stand()));

const schema = z.object({ modus: z.enum(["uit", "kijken", "aan"]).optional(), bevestigd: z.boolean().optional(), noodrem: z.boolean().optional() });

const MODUS_TEKST = { uit: "uitgezet", kijken: "op kijken gezet (droge ronde)", aan: "aangezet (rolt echt uit)" } as const;

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => ({})));
  if (body.modus !== undefined) {
    if (body.modus === "aan" && body.bevestigd !== true) throw AppError.validation("Bevestig eerst dat de Auto-uitrol echt mag uitrollen.");
    if (body.modus === "uit") {
      await setFlag("auto-uitrol", { enabled: false }, principal.userId);
      await zetModus("uit", principal.userId);
    } else {
      // een mens zet hem aan: de harde stop van de nacontrole vervalt (en de noodrem die de nacontrole zelf zette)
      if (!(await herstelNaStopMetSlot(principal.userId))) throw AppError.upstream("Er loopt net een ronde van de Auto-uitrol; probeer het over een minuut opnieuw.");
      // eerst de modus, dan pas de vlag: een ronde ziet nooit een aangezette vlag met een oude modus
      await zetModus(body.modus, principal.userId);
      await setFlag("auto-uitrol", { enabled: true }, principal.userId);
    }
    await recordAudit({ category: "ADMIN", action: "admin.auto-uitrol.schakelaar", severity: "info", actorUserId: principal.userId, actorLabel: "user", summary: `Auto-uitrol ${MODUS_TEKST[body.modus]}` });
  }
  if (body.noodrem !== undefined) {
    await zetNoodrem(body.noodrem, principal.userId);
    await recordAudit({ category: "ADMIN", action: "admin.auto-uitrol.noodrem", severity: "warning", actorUserId: principal.userId, actorLabel: "user", summary: `Auto-uitrol noodrem ${body.noodrem ? "aan" : "uit"}` });
  }
  return NextResponse.json(await stand());
});